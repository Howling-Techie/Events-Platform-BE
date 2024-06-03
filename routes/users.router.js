const {
    getUsers,
    getUser,
    postUser,
    patchUser,
    deleteUser,
    getUserGroups
} = require("../controllers/users.controller");

const usersRouter = require("express").Router();

usersRouter
    .route("/")
    .get(getUsers)
    .post(postUser);

usersRouter
    .route("/:user_id")
    .get(getUser)
    .patch(patchUser)
    .delete(deleteUser);

usersRouter
    .route("/:user_id/groups")
    .get(getUserGroups);

module.exports = usersRouter;
