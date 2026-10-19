const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");

const PORT = Number(process.env.PORT || 3000);
const COUNTRIES_NOW_URL =
    "https://countriesnow.space/api/v0.1/countries/info?returns=name,capital,currency,iso2,iso3,flag";
const WORLD_BANK_URL = "https://api.worldbank.org/v2";
const CATALOG_CACHE_DURATION = 6 * 60 * 60 * 1000;
let countryCatalog;
let countryCatalogFetchedAt = 0;

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(payload));
}

async function getJson(url) {
    let response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (error) {
        if (error.name === "TimeoutError") {
            const timeoutError = new Error("Country data service timed out.");
            timeoutError.statusCode = 504;
            throw timeoutError;
        }

        const serviceError = new Error("Country data service is unavailable.");
        serviceError.statusCode = 502;
        throw serviceError;
    }

    if (response.status === 404) {
        const notFoundError = new Error("No matching country was found.");
        notFoundError.statusCode = 404;
        throw notFoundError;
    }

    if (!response.ok) {
        const serviceError = new Error("Country data service returned an error.");
        serviceError.statusCode = 502;
        throw serviceError;
    }

    return response.json().catch(() => {
        const serviceError = new Error("Country data service returned invalid data.");
        serviceError.statusCode = 502;
        throw serviceError;
    });
}

async function getCountryCatalog() {
    if (countryCatalog && Date.now() - countryCatalogFetchedAt < CATALOG_CACHE_DURATION) {
        return countryCatalog;
    }

    const result = await getJson(COUNTRIES_NOW_URL);
    if (result.error || !Array.isArray(result.data)) {
        const serviceError = new Error("Country data service returned an unexpected response.");
        serviceError.statusCode = 502;
        throw serviceError;
    }

    const countriesByCode = new Map();
    for (const country of result.data) {
        if (!countriesByCode.has(country.iso3)) {
            countriesByCode.set(country.iso3, country);
        }
    }
    countryCatalog = [...countriesByCode.values()];
    countryCatalogFetchedAt = Date.now();
    return countryCatalog;
}

async function normalizeCountry(country) {
    const code = country.iso3;
    if (!code || !/^[A-Z]{3}$/.test(code)) {
        const serviceError = new Error("Country data is missing a valid ISO country code.");
        serviceError.statusCode = 502;
        throw serviceError;
    }

    const populationUrl =
        `${WORLD_BANK_URL}/country/${code}/indicator/SP.POP.TOTL?format=json&per_page=100`;
    const regionUrl = `${WORLD_BANK_URL}/country/${code}?format=json`;
    const [populationResult, regionResult] = await Promise.all([
        getJson(populationUrl),
        getJson(regionUrl),
    ]);
    const populationRecords = Array.isArray(populationResult[1])
        ? populationResult[1]
        : [];
    const population = populationRecords.find((record) => record.value !== null)?.value ?? null;
    const bankCountry = Array.isArray(regionResult[1]) ? regionResult[1][0] : null;

    return {
        name: country.name,
        code: country.iso2 || code,
        capital: country.capital ? [country.capital] : [],
        currency: country.currency || "",
        population,
        region: bankCountry?.region?.value || "Unknown",
        flag: {
            url: country.flag || "",
            alt: `${country.name} flag`,
        },
    };
}

async function findCountries(name) {
    const catalog = await getCountryCatalog();
    const query = name.toLocaleLowerCase();
    const matches = catalog
        .filter((country) => country.name?.toLocaleLowerCase().includes(query))
        .sort((a, b) => {
            const aName = a.name.toLocaleLowerCase();
            const bName = b.name.toLocaleLowerCase();
            const aRank = aName === query ? 0 : aName.startsWith(query) ? 1 : 2;
            const bRank = bName === query ? 0 : bName.startsWith(query) ? 1 : 2;
            return aRank - bRank || aName.localeCompare(bName);
        });
    if (!matches.length) {
        const notFoundError = new Error("No matching country was found.");
        notFoundError.statusCode = 404;
        throw notFoundError;
    }

    return Promise.all(matches.slice(0, 5).map(normalizeCountry));
}

async function findCountryByCode(code) {
    const catalog = await getCountryCatalog();
    const normalizedCode = code.toUpperCase();
    const country = catalog.find(
        (entry) =>
            entry.iso2?.toUpperCase() === normalizedCode ||
            entry.iso3?.toUpperCase() === normalizedCode
    );
    if (!country) {
        const notFoundError = new Error("No matching country was found.");
        notFoundError.statusCode = 404;
        throw notFoundError;
    }

    return normalizeCountry(country);
}

async function handleApiRequest(requestUrl, response) {
    const countryPath = requestUrl.pathname;

    if (countryPath === "/api/countries") {
        const name = requestUrl.searchParams.get("name")?.trim();
        if (!name) {
            sendJson(response, 400, {
                error: "A country name is required. Use ?name=... .",
            });
            return;
        }

        sendJson(response, 200, await findCountries(name));
        return;
    }

    const codeMatch = countryPath.match(/^\/api\/countries\/([a-zA-Z]{2,3})$/);
    if (codeMatch) {
        sendJson(response, 200, await findCountryByCode(codeMatch[1]));
        return;
    }

    sendJson(response, 404, { error: "API endpoint not found." });
}

async function serveStaticFile(pathname, response) {
    const files = {
        "/": "index.html",
        "/index.html": "index.html",
        "/style.css": "style.css",
        "/app.js": "app.js",
    };
    const fileName = files[pathname];
    if (!fileName) {
        sendJson(response, 404, { error: "Page not found." });
        return;
    }

    const filePath = path.join(__dirname, fileName);
    let contents;
    try {
        contents = await fs.readFile(filePath);
    } catch (error) {
        console.error(`Could not read ${fileName}:`, error);
        sendJson(response, 500, { error: "Could not load the requested page." });
        return;
    }

    const contentTypes = {
        "index.html": "text/html; charset=utf-8",
        "style.css": "text/css; charset=utf-8",
        "app.js": "text/javascript; charset=utf-8",
    };
    response.writeHead(200, {
        "Content-Type": contentTypes[fileName],
        "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
}

const server = http.createServer(async (request, response) => {
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        sendJson(response, 405, { error: "Only GET requests are supported." });
        return;
    }

    let requestUrl;
    try {
        requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    } catch {
        sendJson(response, 400, { error: "Invalid request URL." });
        return;
    }

    try {
        if (requestUrl.pathname.startsWith("/api/")) {
            await handleApiRequest(requestUrl, response);
            return;
        }

        await serveStaticFile(requestUrl.pathname, response);
    } catch (error) {
        const statusCode = error.statusCode || 502;
        if (statusCode >= 500) {
            console.error("Country API request failed:", error);
        }
        sendJson(response, statusCode, { error: error.message });
    }
});

server.listen(PORT, () => {
    console.log(`Country Info API running at http://localhost:${PORT}`);
});
