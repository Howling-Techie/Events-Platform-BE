const {
    getGroups,
    postGroup,
    deleteGroup,
    getGroupEvents,
    getGroupUsers,
    getGroup,
    patchGroup, postGroupJoin, deleteGroupJoin, deleteGroupUser, patchGroupUser
} = require("../controllers/groups.controller");
const groupsRouter = require("express").Router();

groupsRouter
    .route("/")
    .get(getGroups)
    .post(postGroup)
    .patch(patchGroup)
    .delete(deleteGroup);

groupsRouter
    .route("/:group_id")
    .get(getGroup);

groupsRouter
    .route("/:group_id/events")
    .get(getGroupEvents);

groupsRouter
    .route("/:group_id/users")
    .get(getGroupUsers);

groupsRouter
    .route("/:group_id/users/:user_id")
    .patch(patchGroupUser)
    .delete(deleteGroupUser);

groupsRouter
    .route("/:group_id/join")
    .post(postGroupJoin);

groupsRouter
    .route("/:group_id/leave")
    .post(deleteGroupJoin);

module.exports = groupsRouter;
