const {
    selectEvents,
    selectEvent,
    insertEvent,
    deleteEvent,
    updateEvent,
    selectEventComments,
    insertEventComment,
    deleteEventComment,
    selectEventUsers,
    insertEventUser,
    updateEventUser,
    deleteEventUser
} = require("../models/events.model");

exports.getEvents = (req, res, next) => {
    selectEvents(req.query, req.headers)
        .then((events) => {
            res.status(200).send({events});
        })
        .catch((error) => {
            next(error);
        });
};

exports.getEvent = (req, res, next) => {
    selectEvent(req.params, req.headers)
        .then((event) => {
            res.status(200).send({event});
        })
        .catch((error) => {
            next(error);
        });
};

exports.postEvent = (req, res, next) => {
    insertEvent(req.body, req.headers)
        .then((event) => {
            res.status(201).send(event);
        })
        .catch((error) => {
            next(error);
        });
};

exports.deleteEvent = (req, res, next) => {
    deleteEvent(req.params, req.headers)
        .then(() => {
            res.status(204).send();
        })
        .catch((error) => {
            next(error);
        });
};

exports.patchEvent = (req, res, next) => {
    updateEvent(req.params, req.body, req.headers)
        .then((event) => {
            res.status(200).send({event});
        })
        .catch((error) => {
            next(error);
        });
};

exports.getComments = (req, res, next) => {
    selectEventComments(req.params, req.headers)
        .then((entries) => {
            res.status(200).send({entries});
        })
        .catch((error) => {
            next(error);
        });
};

exports.postComment = (req, res, next) => {
    insertEventComment(req.params, req.body, req.headers)
        .then((comment) => {
            res.status(201).send(comment);
        })
        .catch((error) => {
            next(error);
        });
};

exports.deleteComment = (req, res, next) => {
    deleteEventComment(req.params, req.headers)
        .then(() => {
            res.status(204).send();
        })
        .catch((error) => {
            next(error);
        });
};

exports.getUsers = (req, res, next) => {
    selectEventUsers(req.params, req.headers)
        .then((users) => {
            res.status(200).send({users});
        })
        .catch((error) => {
            next(error);
        });
};

exports.postUser = (req, res, next) => {
    insertEventUser(req.params, req.body, req.headers)
        .then((user) => {
            res.status(201).send({user});
        })
        .catch((error) => {
            next(error);
        });
};

exports.patchUser = (req, res, next) => {
    updateEventUser(req.params, req.body, req.headers)
        .then((user) => {
            res.status(200).send({user});
        })
        .catch((error) => {
            next(error);
        });
};

exports.deleteUser = (req, res, next) => {
    deleteEventUser(req.params, req.headers)
        .then((user) => {
            res.status(200).send({user});
        })
        .catch((error) => {
            next(error);
        });
};