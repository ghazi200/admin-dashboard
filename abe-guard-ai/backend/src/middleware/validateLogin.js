/**
 * Request validation for login endpoints (guard and admin).
 */
const { body, validationResult } = require("express-validator");

const loginValidators = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Must be a valid email")
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage("Email too long"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 1, max: 512 })
    .withMessage("Password length invalid"),
];

function handleLoginValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ message: first.msg || "Validation failed" });
  }
  next();
}

module.exports = { loginValidators, handleLoginValidation };
