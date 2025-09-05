// src/utils/isAdmin.js
export function isAdminEmail(email) {
  return (email || "").toLowerCase() === "admin@mail.com";
}
