const {
    selectUsers,
    selectUser,
    insertUser,
    deleteUser,
    updateUser,
    selectUserGroups,
} = require("../models/users.model");

exports.getUsers = (req, res, next) => {
    selectUsers(req.query, req.headers)
        .then((users) => {
            res.status(200).send({users});
        })
        .catch((error) => {
            next(error);
        });
};

exports.getUser = (req, res, next) => {
    selectUser(req.params, req.headers)
        .then((user) => {
            res.status(200).send({user});
        })
        .catch((error) => {
            next(error);
        });
};

exports.postUser = (req, res, next) => {
    insertUser(req.body, req.headers)
        .then((user) => {
            res.status(201).send(user);
        })
        .catch((error) => {
            next(error);
        });
};

exports.deleteUser = (req, res, next) => {
    deleteUser(req.params, req.headers)
        .then(() => {
            res.status(204).send();
        })
        .catch((error) => {
            next(error);
        });
};

exports.patchUser = (req, res, next) => {
    updateUser(req.params, req.body, req.headers)
        .then((user) => {
            res.status(200).send({user});
        })
        .catch((error) => {
            next(error);
        });
};

exports.getUserGroups = (req, res, next) => {
    selectUserGroups(req.params, req.headers)
        .then((groups) => {
            res.status(200).send({groups});
        })
        .catch((error) => {
            next(error);
        });
};