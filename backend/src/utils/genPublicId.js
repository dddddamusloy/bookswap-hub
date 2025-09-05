const { v4: uuidv4 } = require("uuid");
module.exports = function genPublicId(prefix = "BK") {
  // short public id like BK-3f9c2a
  return `${prefix}-${uuidv4().slice(0,6)}`;
};
