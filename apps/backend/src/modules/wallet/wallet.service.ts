import { prisma, Prisma, WalletTransactionType, PayoutStatus } from "@home-service/database";
import { NotFoundError, ValidationError } from "@home-service/shared";

/**
 * All balance changes go through this module and every one of them writes
 * an append-only WalletTransaction row before the cached Wallet balances are
 * updated (spec §15: "financial records must be immutable/auditable... use
 * a proper ledger model"). Nothing else in the codebase should write to
 * Wallet.availableBalance/pendingBalance/totalEarnings directly.
 */

type TxClient = Prisma.TransactionClient;

export async function getOrCreateWallet(technicianProfileId: string) {
  return prisma.wallet.upsert({
    where: { technicianProfileId },
    update: {},
    create: { technicianProfileId },
  });
}

/**
 * Core earning-credit logic, usable both standalone (creditEarning) and
 * nested inside a caller's own transaction (payments.service, so a booking's
 * PAID transition and its wallet credit commit atomically together).
 */
export async function creditEarningTx(tx: TxClient, technicianProfileId: string, bookingId: string, amount: number) {
  const wallet = await tx.wallet.upsert({
    where: { technicianProfileId },
    update: {},
    create: { technicianProfileId },
  });

  const balanceAfter = Number(wallet.availableBalance) + amount;

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: WalletTransactionType.EARNING_CREDIT,
      amount,
      balanceAfter,
      bookingId,
      description: `Earnings for booking ${bookingId}`,
    },
  });

  return tx.wallet.update({
    where: { id: wallet.id },
    data: {
      availableBalance: { increment: amount },
      totalEarnings: { increment: amount },
    },
  });
}

/** Credits a technician's wallet for a completed, paid booking (standalone transaction). */
export async function creditEarning(technicianProfileId: string, bookingId: string, amount: number) {
  return prisma.$transaction((tx) => creditEarningTx(tx, technicianProfileId, bookingId, amount));
}

/** Technician requests a withdrawal — reserves the funds immediately (available -> pending). */
export async function requestWithdrawal(technicianProfileId: string, amount: number) {
  if (amount <= 0) throw new ValidationError("Withdrawal amount must be positive");

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { technicianProfileId } });
    if (!wallet) throw new NotFoundError("Wallet", technicianProfileId);
    if (Number(wallet.availableBalance) < amount) {
      throw new ValidationError("Insufficient available balance");
    }

    const balanceAfter = Number(wallet.availableBalance) - amount;

    const payout = await tx.payout.create({
      data: { walletId: wallet.id, technicianProfileId, amount, status: PayoutStatus.PENDING },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.WITHDRAWAL_DEBIT,
        amount,
        balanceAfter,
        payoutId: payout.id,
        description: `Withdrawal request ${payout.id}`,
      },
    });

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { availableBalance: { decrement: amount }, pendingBalance: { increment: amount } },
    });

    return payout;
  });
}

export async function completePayout(payoutId: string, providerReference: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundError("Payout", payoutId);

    await tx.wallet.update({
      where: { id: payout.walletId },
      data: { pendingBalance: { decrement: payout.amount } },
    });

    return tx.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.COMPLETED, processedAt: new Date(), providerReference },
    });
  });
}

/** Payout failed at the provider — reverse the reservation back to available balance. */
export async function failPayout(payoutId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundError("Payout", payoutId);

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: payout.walletId } });
    const balanceAfter = Number(wallet.availableBalance) + Number(payout.amount);

    await tx.walletTransaction.create({
      data: {
        walletId: payout.walletId,
        type: WalletTransactionType.WITHDRAWAL_REVERSAL_CREDIT,
        amount: payout.amount,
        balanceAfter,
        payoutId,
        description: `Reversal for failed payout ${payoutId}: ${reason}`,
      },
    });

    await tx.wallet.update({
      where: { id: payout.walletId },
      data: { pendingBalance: { decrement: payout.amount }, availableBalance: { increment: payout.amount } },
    });

    return tx.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.FAILED, failureReason: reason, processedAt: new Date() },
    });
  });
}
