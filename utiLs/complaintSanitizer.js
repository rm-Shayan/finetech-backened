// utils/sanitizers/complaint.sanitizer.js

export const sanitizeComplaint = (complaint) => {
  if (!complaint) return null;

  return {
    _id: complaint._id,
    complaintNo: complaint.complaintNo,
    type: complaint.type,
    category: complaint.category,
    priority: complaint.priority,
    status: complaint.status,

    description: complaint.description,
    attachments: complaint.attachments || [],

    resolvedAt: complaint.resolvedAt,
    closedAt: complaint.closedAt,
    assignedAt: complaint.assignedAt,
    rejectedAt: complaint.rejectedAt,
    escalatedAt: complaint.escalatedAt,
    remark:complaint?.remark||null,

    createdAt: complaint.createdAt,
    updatedAt: complaint.updatedAt,
  };
};
