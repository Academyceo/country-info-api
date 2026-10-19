const input = document.getElementById("countryInput");
const form = document.getElementById("searchForm");
const button = document.getElementById("searchBtn");
const countryInfo = document.getElementById("countryInfo");
const message = document.getElementById("message");
const COUNTRIES_URL =
    "https://countriesnow.space/api/v0.1/countries/info?returns=name,capital,currency,iso2,iso3,flag";
const WORLD_BANK_URL = "https://api.worldbank.org/v2";

let countryCatalogPromise;
const countryDetailsCache = new Map();

async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
        throw new Error(`A country data service returned HTTP ${response.status}.`);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("A country data service returned a webpage instead of JSON.");
    }
    return response.json();
}

function getCountryCatalog() {
    if (!countryCatalogPromise) {
        countryCatalogPromise = fetchJson(COUNTRIES_URL).then((result) => {
            if (result.error || !Array.isArray(result.data)) {
                throw new Error("The country list could not be loaded.");
            }

            const countriesByCode = new Map();
            for (const country of result.data) {
                if (country.iso3 && !countriesByCode.has(country.iso3)) {
                    countriesByCode.set(country.iso3, country);
                }
            }
            return [...countriesByCode.values()];
        }).catch((error) => {
            countryCatalogPromise = undefined;
            throw error;
        });
    }
    return countryCatalogPromise;
}

async function getCountryDetails(country) {
    if (!countryDetailsCache.has(country.iso3)) {
        const detailsPromise = Promise.allSettled([
            fetchJson(
                `${WORLD_BANK_URL}/country/${encodeURIComponent(country.iso3)}` +
                    "/indicator/SP.POP.TOTL?format=json&per_page=100"
            ),
            fetchJson(
                `${WORLD_BANK_URL}/country/${encodeURIComponent(country.iso3)}?format=json`
            ),
        ]).then(([populationResponse, regionResponse]) => {
            const populationRecords =
                populationResponse.status === "fulfilled" &&
                Array.isArray(populationResponse.value[1])
                    ? populationResponse.value[1]
                    : [];
            const population =
                populationRecords.find((record) => record.value !== null)?.value ?? null;
            const bankCountry =
                regionResponse.status === "fulfilled" &&
                Array.isArray(regionResponse.value[1])
                    ? regionResponse.value[1][0]
                    : null;

            if (populationResponse.status === "rejected") {
                console.warn("Country population could not be loaded:", populationResponse.reason);
            }
            if (regionResponse.status === "rejected") {
                console.warn("Country region could not be loaded:", regionResponse.reason);
            }

            return {
                name: country.name,
                code: country.iso2 || country.iso3,
                capital: country.capital ? [country.capital] : [],
                currency: country.currency || "",
                population,
                region: bankCountry?.region?.value || "Unknown",
                flag: {
                    url: country.flag || "",
                    alt: `${country.name} flag`,
                },
            };
        });

        countryDetailsCache.set(country.iso3, detailsPromise);
        detailsPromise.catch(() => countryDetailsCache.delete(country.iso3));
    }
    return countryDetailsCache.get(country.iso3);
}

async function searchCountryByName(name) {
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
        throw new Error(`No country matching "${name}" was found.`);
    }
    return getCountryDetails(matches[0]);
}

function addDetail(card, label, value) {
    const row = document.createElement("p");
    const heading = document.createElement("strong");
    heading.textContent = `${label}: `;
    row.append(heading, document.createTextNode(value));
    card.append(row);
}

function renderCountry(country) {
    const card = document.createElement("article");
    card.className = "country-card";

    const flagUrl = country.flag.url;
    if (flagUrl) {
        const flag = document.createElement("img");
        flag.src = flagUrl;
        flag.alt = country.flag.alt;
        flag.loading = "lazy";
        card.append(flag);
    }

    const name = document.createElement("h2");
    name.textContent = country.name;
    card.append(name);

    addDetail(card, "Capital", country.capital.join(", ") || "N/A");
    addDetail(
        card,
        "Population",
        country.population === null ? "N/A" : country.population.toLocaleString()
    );
    addDetail(card, "Region", country.region);
    addDetail(card, "Currency", country.currency || "N/A");
    addDetail(card, "Country code", country.code || "N/A");

    countryInfo.replaceChildren(card);
}

async function searchCountry(event) {
    event.preventDefault();
    const countryName = input.value.trim();

    countryInfo.replaceChildren();
    if (!countryName) {
        message.textContent = "Please enter a country name.";
        input.focus();
        return;
    }

    message.textContent = "Searching...";
    button.disabled = true;

    try {
        const country = await searchCountryByName(countryName);
        renderCountry(country);
        message.textContent = "";
    } catch (error) {
        console.error("Country search failed:", error);
        message.textContent = error.name === "TimeoutError"
            ? "The country data service timed out. Please try again."
            : error.message || "The country search failed. Please try again.";
    } finally {
        button.disabled = false;
    }
}

form.addEventListener("submit", searchCountry);
