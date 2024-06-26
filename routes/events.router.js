const {
    getEvents,
    getEvent,
    postEvent,
    patchEvent,
    deleteEvent,
    getComments,
    postComment,
    deleteComment,
    getUsers,
    postUser,
    patchUser,
    deleteUser, patchUserPayment
} = require("../controllers/events.controller");
const eventsRouter = require("express").Router();

eventsRouter
    .route("/")
    .get(getEvents)
    .post(postEvent);

eventsRouter
    .route("/:event_id")
    .get(getEvent)
    .patch(patchEvent)
    .delete(deleteEvent);

eventsRouter
    .route("/:event_id/comments")
    .get(getComments)
    .post(postComment)
    .delete(deleteComment);

eventsRouter
    .route("/:event_id/users")
    .get(getUsers)
    .post(postUser)
    .delete(deleteUser);

eventsRouter
    .route("/:event_id/users/:user_id")
    .patch(patchUser)
    .delete(deleteUser);

eventsRouter
    .route("/:event_id/users/:user_id/payment")
    .patch(patchUserPayment);


module.exports = eventsRouter;
