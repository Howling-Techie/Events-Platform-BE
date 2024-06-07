const {
    getUsers, getUser, postUser, patchUser, deleteUser, getUserGroups, patchUserNote, postUserFollow, deleteUserFollow
} = require("../controllers/users.controller");

const usersRouter = require("express").Router();

usersRouter
    .route("/")
    .get(getUsers)
    .post(postUser);

usersRouter
    .route("/:username")
    .get(getUser)
    .patch(patchUser)
    .delete(deleteUser);

usersRouter
    .route("/:username/groups")
    .get(getUserGroups);

usersRouter
    .route("/:username/note")
    .patch(patchUserNote);

usersRouter
    .route("/:username/follow")
    .post(postUserFollow)
    .delete(deleteUserFollow);

module.exports = usersRouter;
