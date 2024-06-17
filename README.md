# Events Platform

## Overview

This is a project for allowing for the managing and creating events for groups, with options to set up payments,
locations, and google calendar integration.

## Frontend

The frontend component is built with React Native and can be found
at [Events Platform Frontend](https://github.com/Howling-Techie/events-platform-fe). To set up the
frontend, follow these steps:

1. Clone the repository:

```
git clone gh repo clone Howling-Techie/events-platform-fe
```

2. Install dependencies:

```
npm install;
npm run build;
```

3. Create a `.env` file in the root directory and add the following variables:

```
VITE_API_URL=[URL to the backend API]
VITE_STRIPE_PUBLISHABLE_KEY=[Stripe publishable key for the client side]
```

4. Run the application:

```
vite preview --host
```

## Backend

The backend component is implemented using Express.js and can be found
at [Events Platform Backend](https://github.com/Howling-Techie/Events-Platform-BE). To set up the backend, follow these
steps:

1. Clone the repository:

```
git repo clone Howling-Techie/Events-Platform-BE
```

2. Install dependencies:

```
npm install
```

3. Create a ```.env``` file in the root directory and add the following variables:

```
GOOGLE_APPLICATION_CREDENTIALS=[google_credentials.json]
GOOGLE_CALENDAR_ID=[ID for the google calendar events should be added to. The credentials provided above should have read/write credentials to this]
STRIPE_SECRET=[Stripe secret API key]
JWT_[Unique key for generating JWT tokens]
PORT=[Port the server will listen on]
PATH_URL=[If this is hosted on a subdirectory, eg www.site.com/events]
DATABASE_HOST=[Database Host URL]
DATABASE_PORT=[Database Host Port]
DATABASE_NAME=[Database Host database Name]
DATABASE_USER=[Database Host Username]
DATABASE_PASS=[Database Host Password]
DB_CERT=[If the database requires a certificate]
```

4. Run the application:

```
npm run start
```

## Tech Stack

This project was built using Typescript, Vite, and React for the frontend, with Tailwind used for styling.

For the backend, an express.js server written in javascript has been used.

## Demo

To see the project in action, visit the [demonstration site on Render.](https://events-platform-fe.onrender.com/)