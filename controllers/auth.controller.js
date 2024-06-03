const {signInUser, refreshCurrentUser} = require("../models/auth.model");
exports.signInUser = (req, res, next) => {
    signInUser(req.body)
        .then((response) => {
            res.status(200).send(response);
        })
        .catch((error) => {
            next(error);
        });
};

exports.refreshUser = (req, res, next) => {
    refreshCurrentUser(req.body)
        .then((token) => {
            res.status(200).send(token);
        })
        .catch((error) => {
            next(error);
        });
};
