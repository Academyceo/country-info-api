const input = document.getElementById("countryInput");
const form = document.getElementById("searchForm");
const button = document.getElementById("searchBtn");
const countryInfo = document.getElementById("countryInfo");
const message = document.getElementById("message");

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
        const response = await fetch(
            `/api/countries?name=${encodeURIComponent(countryName)}`
        );
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "The country search failed.");
        }
        if (!Array.isArray(result) || result.length === 0) {
            throw new Error("No matching country was found.");
        }

        renderCountry(result[0]);
        message.textContent = "";
    } catch (error) {
        message.textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

form.addEventListener("submit", searchCountry);
