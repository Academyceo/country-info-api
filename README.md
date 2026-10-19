# Country Info API

A country-search website and optional Node.js JSON API. The website works on
GitHub Pages and other static hosts by loading country data directly from free,
no-key country data and World Bank services.

## Run

Install Node.js 18 or later, then start the server from this folder:

```bash
npm start
```

Open `http://localhost:3000` in a browser. The server does not require
third-party npm packages and provides the optional API endpoints below.

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

The website does not call these local API endpoints, because static hosting
such as GitHub Pages cannot run a Node.js server. Instead it fetches the data
from the no-key providers directly, so country searches work on the published
GitHub Pages site as well as locally. Population and country details are cached
in memory while the page remains open.
