export const sanitizeUser = (user) => {
  if (!user) return null;
 
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatar: { url: user.avatar.url },
   bankId: user.bankId?._id || null,       // id
    bankCode: user.bankId?.bankCode || null, // optional: bank code
    bankName: user.bankId?.name || null,    // optional: bank name
    createdAt: user.createdAt,
  };
};
