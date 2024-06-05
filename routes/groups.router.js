const {
    getGroups,
    postGroup,
    deleteGroup,
    getGroupEvents,
    getGroupUsers,
    getGroup,
    patchGroup
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


module.exports = groupsRouter;
