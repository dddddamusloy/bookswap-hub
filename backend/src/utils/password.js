// utils/password.js
// Require: min 8, at least 1 lower, 1 upper, 1 digit, 1 symbol
const STRONG_PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

function validateStrongPassword(pw) {
  return STRONG_PW.test(pw);
}

module.exports = { validateStrongPassword };
