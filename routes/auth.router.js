const {signInUser, refreshUser} = require("../controllers/auth.controller");
const authRouter = require("express").Router();

authRouter.route("/signin").post(signInUser);

authRouter.route("/refresh").post(refreshUser);

module.exports = authRouter;
