const authRouter = require("./auth.router");
const usersRouter = require("./users.router");
const eventsRouter = require("./events.router");
const groupsRouter = require("./groups.router");

const apiRouter = require("express").Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/events", eventsRouter);
apiRouter.use("/groups", groupsRouter);
module.exports = apiRouter;
