var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var app = express();
const apiRouter = require("./routes/api.router");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

app.use(cors());
app.use(bodyParser.json());

app.use(process.env.PATH_URL + "/api", apiRouter);

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", apiRouter);

app.post("/create-payment-intent", async (req, res) => {
    const {amount, eventId, paymentMethodId} = req.body;

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Stripe amount is in pennies
            currency: "gbp",
            payment_method: paymentMethodId,
            confirm: true,
            metadata: {eventId},
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: "never",
            },
        });

        res.json({clientSecret: paymentIntent.client_secret});
    } catch (error) {
        console.error(error);
        res.status(500).send({error: error.message});
    }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use((err, req, res, next) => {
    if (err.status && err.msg) {
        res.status(err.status).send({msg: err.msg});
    } else {
        console.log(err);
        res.status(500).send({msg: "Internal Server Error"});
    }
});

console.log("Listening on http://localhost:" + process.env.PORT);

module.exports = app;
