// utils/sanitizers/remark.sanitizer.js

export const sanitizeRemark = (remark) => {
  if (!remark) return null;

  return {
    id: remark._id,
    actionType: remark.actionType,
    reason: remark.reason,
    createdAt: remark.createdAt,
  };
};
