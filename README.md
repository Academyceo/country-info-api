# Country Info API

A small Node.js server and country-search website. The server uses free,
no-key country data and World Bank population and region data, then exposes a
normalized JSON API to the browser.

## Run

Install Node.js 18 or later, then start the server from this folder:

```bash
npm start
```

Open `http://localhost:3000` in a browser. The server does not require
third-party npm packages.

## API

- `GET /api/countries?name=Nigeria` — search for countries by name; returns an
  array of up to five country objects, with exact and prefix matches first.
- `GET /api/countries/NGA` — look up one country by its two- or three-letter
  country code; returns one country object.

Country objects contain `name`, `code`, `capital`, `currency`, `population`,
`region`, and `flag`. Some values may be empty when the data sources do not
provide them. The country catalog is cached in memory for six hours.
The upstream catalog currently supplies 250 records representing 248 unique
ISO-3 codes, including territories and other country-level regions.

The API returns JSON errors with an appropriate HTTP status for invalid input,
unknown countries, and upstream service failures.
