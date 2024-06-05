const {
    selectGroups,
    selectGroup,
    selectGroupUsers,
    selectGroupEvents,
    insertGroup,
    deleteGroup,
    updateGroup
} = require("../models/groups.model");

exports.getGroups = (req, res, next) => {
    selectGroups(req.query, req.headers)
        .then((groups) => {
            res.status(200).send({groups});
        })
        .catch((error) => {
            next(error);
        });
};

exports.getGroup = (req, res, next) => {
    selectGroup(req.params, req.headers)
        .then((group) => {
            res.status(200).send({group});
        })
        .catch((error) => {
            console.log(error);
            next(error);
        });
};

exports.getGroupUsers = (req, res, next) => {
    selectGroupUsers(req.params, req.headers)
        .then((users) => {
            res.status(200).send({users});
        })
        .catch((error) => {
            next(error);
        });
};

exports.getGroupEvents = (req, res, next) => {
    selectGroupEvents(req.params, req.query, req.headers)
        .then((events) => {
            res.status(200).send({events});
        })
        .catch((error) => {
            next(error);
        });
};

exports.postGroup = (req, res, next) => {
    insertGroup(req.params, req.body, req.headers)
        .then((group) => {
            res.status(201).send(group);
        })
        .catch((error) => {
            next(error);
        });
};

exports.patchGroup = (req, res, next) => {
    updateGroup(req.params, req.headers)
        .then((group) => {
            res.status(200).send(group);
        })
        .catch((error) => {
            next(error);
        });
};

exports.deleteGroup = (req, res, next) => {
    deleteGroup(req.params, req.headers)
        .then(() => {
            res.status(204).send();
        })
        .catch((error) => {
            next(error);
        });
};