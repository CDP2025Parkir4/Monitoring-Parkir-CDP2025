const buttonTargets = {
    filkom: 'pages/parkiran_filkom/parkiran_filkom.html',
    fisip: 'pages/parkiran_fisip/parkiran_fisip.html',
    sakri: 'pages/parkiran_sakri/parkiran_sakri.html',
    ftp: 'pages/parkiran_ftp/parkiran_ftp.html',
    fK: 'pages/parkiran_kedokteran/parkiran_kedokteran.html',
    feb1: 'pages/parkiran_feb_d/parkiran_feb_d.html',
    feb2: 'pages/parkiran_feb_e/parkiran_feb_e.html',
    dummy: 'pages/dummy/dummy.html',
};

Object.entries(buttonTargets).forEach(([lotId, targetUrl]) => {
    const button = document.querySelector(`[data-lot-id=\"${lotId}\"] .btn`);
    if (button) {
        button.addEventListener('click', () => {
            window.location.href = targetUrl;
        });
    }
});

const searchInput = document.getElementById('search-input');
const cards = Array.from(document.querySelectorAll('.grid-cards .card'));

function buildSearchIndex(card) {
    if (card.dataset.searchText) return card.dataset.searchText;
    const title = card.querySelector('h3')?.textContent ?? '';
    const metaText = Array.from(card.querySelectorAll('.card-meta span'))
        .map((span) => span.textContent)
        .join(' ');
    const searchText = `${title} ${metaText}`.trim().toLowerCase();
    card.dataset.searchText = searchText;
    return searchText;
}

function filterCards(query = '') {
    const normalizedQuery = query.trim().toLowerCase();
    cards.forEach((card) => {
        const searchText = buildSearchIndex(card);
        const matches = !normalizedQuery || searchText.includes(normalizedQuery);
        card.style.display = matches ? '' : 'none';
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (event) => {
        filterCards(event.target.value);
    });
    filterCards();
}


