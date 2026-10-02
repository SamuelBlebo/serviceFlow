import { paths } from "@serviceflow/firebase";
import {
  DECISION_TARGET,
  ForbiddenError,
  NotFoundError,
  type ReviewDecision,
  VerificationStatus,
  assertVerificationTransition,
} from "@serviceflow/shared";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminActionData, adminActionRef } from "../../lib/audit";

/**
 * Admin decisions on technicians (plan §5.4): approve or reject the pending
 * submission, suspend or reinstate a verified technician. Validated by the
 * shared verification state machine; anything but VERIFIED takes the
 * technician offline; every decision is audited and idempotent per request.
 */
export async function reviewTechnician(
  deps: { db: Firestore },
  adminUid: string,
  input: { requestId: string; technicianId: string; decision: ReviewDecision; notes?: string },
): Promise<{ ok: true; id: string }> {
  const { db } = deps;
  if (input.technicianId === adminUid) throw new ForbiddenError("You can't review your own provider account.");

  const technicianRef = db.doc(paths.technician(input.technicianId));
  const actionRef = adminActionRef(db, adminUid, input.requestId);

  await db.runTransaction(async (tx) => {
    const [action, technician] = await Promise.all([tx.get(actionRef), tx.get(technicianRef)]);
    if (action.exists) return;
    if (!technician.exists) throw new NotFoundError("Technician", input.technicianId);

    const from = technician.get("verificationStatus") as VerificationStatus;
    const to = DECISION_TARGET[input.decision];
    assertVerificationTransition(from, to, "ADMIN");

    // Approve/reject act on the pending submission and record the review on it.
    let verificationId: string | null = null;
    if (input.decision === "APPROVE" || input.decision === "REJECT") {
      verificationId = technician.get("latestVerificationId") as string | null;
      const verificationRef = verificationId ? db.doc(paths.technicianVerification(verificationId)) : null;
      const verification = verificationRef ? await tx.get(verificationRef) : null;
      if (!verificationRef || !verification?.exists || verification.get("status") !== VerificationStatus.PENDING) {
        throw new NotFoundError("Pending verification for technician", input.technicianId);
      }
      tx.update(verificationRef, {
        status: to,
        reviewNotes: input.notes ?? null,
        reviewedBy: adminUid,
        reviewedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.update(technicianRef, {
      verificationStatus: to,
      ...(to !== VerificationStatus.VERIFIED ? { isOnline: false } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const actionType = {
      APPROVE: "TECHNICIAN_VERIFIED",
      REJECT: "TECHNICIAN_REJECTED",
      SUSPEND: "TECHNICIAN_SUSPENDED",
      REINSTATE: "TECHNICIAN_REINSTATED",
    }[input.decision];
    tx.create(
      actionRef,
      adminActionData({
        adminUid,
        actionType,
        targetType: "technician",
        targetId: input.technicianId,
        before: { verificationStatus: from },
        after: { verificationStatus: to, ...(verificationId ? { verificationId } : {}) },
        reason: input.notes ?? null,
        requestId: input.requestId,
      }),
    );
  });

  return { ok: true, id: input.technicianId };
}
