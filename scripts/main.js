// News sources configuration
const newsSources = [
    {
        name: 'Nintendo Life',
        homepage: 'https://www.nintendolife.com/',
        url: 'https://www.nintendolife.com/feeds/latest',
        color: '#e60012'
    },
    {
        name: 'Nintendo World Report',
        homepage: 'https://www.nintendoworldreport.com/',
        url: 'https://www.nintendoworldreport.com/rss',
        color: '#2399cb'
    },
    {
        name: 'Pure Nintendo',
        homepage: 'https://www.purenintendo.com/',
        url: 'https://www.purenintendo.com/feed',
        color: '#d45500'
    },
    {
        name: 'My Nintendo News',
        homepage: 'https://mynintendonews.com/',
        url: 'https://mynintendonews.com/feed/',
        color: '#00c2ff'
    },
    {
        name: 'GoNintendo',
        url: 'https://gonintendo.com/feeds/story.xml',
        color: '#cb433f'
    },
    {
        name: 'Nintendo Everything',
        homepage: 'https://nintendoeverything.com/',
        url: 'https://nintendoeverything.com/feed',
        color: '#00bff3'
    },
    {
        name: 'IGN Nintendo',
        homepage: 'https://www.ign.com/',
        url: 'https://www.ign.com/rss/v2/articles/feed?channel=nintendo',
        color: '#FFFFFF'
    },
    {
        name: 'Nintendo Insider',
        homepage: 'https://www.nintendo-insider.com/',
        url: 'https://nintendo-insider.com/feed',
        color: '#e91823'
    },
    {
        name: 'Nintendo Fuse',
        homepage: 'https://nintendofuse.com/',
        url: 'https://nintendofuse.com/rss',
        color: '#78c3fb'
    },
    {
        name: 'Nintendo Soup',
        homepage: 'https://nintendosoup.com/',
        url: 'https://nintendosoup.com/feed',
        color: '#ff0c0c'
    },
    {
        name: 'Nintendojo',
        homepage: 'https://www.nintendojo.com/',
        url: 'https://www.nintendojo.com/feed',
        color: '#f6024a'
    },
    {
        name: 'Nintendo Wire',
        homepage: 'https://nintendowire.com/',
        url: 'https://nintendowire.com/feed',
        color: '#ffcd00'
    }
];

// CORS proxies ordered by reliability - codetabs and corsproxy work best
const CORS_PROXIES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/get?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://thingproxy.freeboard.io/fetch/'
];

// Cache for successful feeds to reduce repeat requests
const feedCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Proxy external images to bypass hotlink protection
function proxyImageUrl(imageUrl) {
    if (!imageUrl || imageUrl.startsWith('images/')) {
        return imageUrl; // Don't proxy local images
    }

    // Use corsproxy.io for images as it handles binary data well
    return `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
}

async function fetchRSSFeed(source) {
    // Check cache first
    const cacheKey = source.url;
    const cachedData = feedCache.get(cacheKey);
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
        return cachedData.data;
    }

    let lastError = null;

    // Try each CORS proxy in sequence with timeout
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxy = CORS_PROXIES[i];
            const proxyUrl = `${proxy}${encodeURIComponent(source.url)}`;

            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                    'Origin': window.location.origin || 'https://nintendo-news-network.com'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            let data;
            let xmlContent;

            // Different proxies return data differently
            if (CORS_PROXIES[i].includes('allorigins')) {
                try {
                    data = await response.json();
                    xmlContent = data.contents || data.data;
                } catch (e) {
                    // If JSON parsing fails, treat as text
                    xmlContent = await response.text();
                }
            } else if (CORS_PROXIES[i].includes('codetabs')) {
                // codetabs.com returns raw content directly
                xmlContent = await response.text();
            } else if (CORS_PROXIES[i].includes('corsproxy.io')) {
                // corsproxy.io returns raw content directly
                xmlContent = await response.text();
            } else {
                // Other proxies typically return the raw content
                xmlContent = await response.text();
            }

            if (!xmlContent || typeof xmlContent !== 'string') {
                throw new Error('Invalid response: no content received');
            }

            // Check if the content is a base64 data URI
            if (xmlContent.startsWith('data:application/rss+xml') || xmlContent.startsWith('data:text/xml') || xmlContent.startsWith('data:application/xml')) {
                // Extract the base64 part after the comma
                const base64Part = xmlContent.split(',')[1];
                if (base64Part) {
                    try {
                        xmlContent = atob(base64Part);
                    } catch (e) {
                        throw new Error('Failed to decode base64 content');
                    }
                }
            }

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

            // Handle potential parsing errors
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                // Try parsing as HTML if XML parsing fails
                const htmlDoc = parser.parseFromString(xmlContent, 'text/html');
                const isHTMLContent = htmlDoc.querySelector('html') !== null;

                if (isHTMLContent) {
                    throw new Error('Received HTML content instead of RSS/XML feed');
                } else {
                    throw new Error(`XML parsing failed: ${parserError.textContent}`);
                }
            }            // Try both RSS (item) and Atom (entry) formats
            let items = xmlDoc.querySelectorAll('item');
            let isAtom = false;

            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('entry');
                isAtom = true;
            }

            // If still no items found, check structure silently
            if (items.length === 0) {
                // Could add fallback logic here if needed
            }

            const articles = [];

            items.forEach((item, index) => {
                if (index < 10) { // Limit to 10 articles per source
                    let title, link, description, pubDate, imageUrl;

                    if (isAtom) {
                        // Atom format
                        title = item.querySelector('title')?.textContent?.trim();

                        // Atom links can be different
                        const linkElement = item.querySelector('link[rel="alternate"]') ||
                                          item.querySelector('link[type="text/html"]') ||
                                          item.querySelector('link');
                        link = linkElement?.getAttribute('href') || linkElement?.textContent?.trim();

                        // Atom can use summary or content
                        description = item.querySelector('summary')?.textContent?.trim() ||
                                    item.querySelector('content')?.textContent?.trim();

                        // Atom uses different date fields
                        pubDate = item.querySelector('published')?.textContent?.trim() ||
                                item.querySelector('updated')?.textContent?.trim();

                        // Atom image extraction
                        imageUrl = extractImageUrl(item, description, true);
                    } else {
                        // RSS format
                        title = item.querySelector('title')?.textContent?.trim();
                        link = item.querySelector('link')?.textContent?.trim();
                        description = item.querySelector('description')?.textContent?.trim();
                        pubDate = item.querySelector('pubDate')?.textContent?.trim();

                        // RSS image extraction
                        imageUrl = extractImageUrl(item, description, false);
                    }

                    if (title && link) {
                        articles.push({
                            title: fixTextEncoding(title),
                            link: link,
                            description: cleanDescription(description),
                            pubDate: formatDate(pubDate),
                            rawDate: pubDate, // Keep raw date for datetime attribute
                            imageUrl: imageUrl
                        });
                    }
                }
            });

            // Success - cache the result and return
            const result = {
                source: source,
                articles: articles,
                error: null
            };

            // Cache successful result
            feedCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;        } catch (error) {
            lastError = error;
            // Continue to next proxy on error
        }
    }

    // If all proxies failed, return error with more helpful message
    const isLocalFile = window.location.protocol === 'file:';
    const errorMessage = isLocalFile
        ? `${source.name}: CORS blocked (try hosting on a web server)`
        : `${source.name}: All proxy servers failed - ${lastError?.message || 'Unknown error'}`;

    return {
        source: source,
        articles: [],
        error: errorMessage
    };
}

function extractImageUrl(item, description, isAtom) {
    let imageUrl = null;

    try {
        if (isAtom) {
            // Try Atom-specific image fields
            imageUrl = item.querySelector('link[rel="enclosure"]')?.getAttribute('href') ||
                      item.querySelector('content[type="html"]')?.textContent;
        } else {
            // Try RSS-specific image fields with more variations
            imageUrl = item.querySelector('enclosure[type^="image"]')?.getAttribute('url') ||
                      item.querySelector('enclosure')?.getAttribute('url') ||
                      item.querySelector('media\\:thumbnail')?.getAttribute('url') ||
                      item.querySelector('thumbnail')?.getAttribute('url') ||
                      item.querySelector('media\\:content[type^="image"]')?.getAttribute('url') ||
                      item.querySelector('media\\:content')?.getAttribute('url') ||
                      item.querySelector('image')?.textContent ||
                      item.querySelector('media\\:group media\\:thumbnail')?.getAttribute('url') ||
                      // WordPress/Common CMS image fields
                      item.querySelector('wp\\:post_thumbnail')?.textContent ||
                      item.querySelector('wp\\:featuredImage')?.textContent ||
                      // IGN-specific selectors
                      item.querySelector('ign\\:image')?.getAttribute('url') ||
                      item.querySelector('ign\\:thumbnail')?.getAttribute('url') ||
                      item.querySelector('feedburner\\:origEnclosureLink')?.textContent ||
                      // More common RSS 2.0 image fields
                      item.querySelector('itunes\\:image')?.getAttribute('href') ||
                      item.querySelector('googleplay\\:image')?.getAttribute('href') ||
                      // Additional image sources for Nintendo sites
                      item.querySelector('yoast\\:image')?.textContent ||
                      item.querySelector('og\\:image')?.getAttribute('content');
        }

        // Try to extract from content fields (comprehensive content search)
        if (!imageUrl) {
            // Try multiple content fields that might contain images
            const contentSources = [
                item.querySelector('content\\:encoded')?.textContent,
                item.querySelector('content')?.textContent,
                item.querySelector('summary')?.textContent,
                item.querySelector('description')?.textContent
            ].filter(content => content && content.trim().length > 0);

            for (let contentText of contentSources) {
                if (imageUrl) break; // Stop if we found an image

                try {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = contentText;

                    // Look for images in order of preference
                    const imageSelectors = [
                        'img.wp-post-image',           // WordPress featured image
                        'img.attachment-large',        // WordPress large attachment
                        'img.featured',                // Generic featured image
                        'img[width][height]',          // Images with dimensions (likely content images)
                        'img[src*="featured"]',        // URLs containing "featured"
                        'img[src*="banner"]',          // URLs containing "banner"
                        'img[src*="hero"]',            // URLs containing "hero"
                        'img:not([src*="avatar"]):not([src*="icon"]):not([src*="logo"])', // Exclude small UI images
                        'img'                          // Any image as last resort
                    ];

                    for (let selector of imageSelectors) {
                        const imgElement = tempDiv.querySelector(selector);
                        if (imgElement) {
                            const imgSrc = imgElement.getAttribute('src') ||
                                          imgElement.getAttribute('data-src') ||
                                          imgElement.getAttribute('data-lazy-src');

                            if (imgSrc && imgSrc.trim()) {
                                // Skip very small images (likely icons/avatars)
                                const width = imgElement.getAttribute('width');
                                const height = imgElement.getAttribute('height');
                                if (width && height && (parseInt(width) < 100 || parseInt(height) < 100)) {
                                    continue;
                                }

                                imageUrl = imgSrc.trim();
                                break;
                            }
                        }
                    }

                    // If no structured img elements found, try regex search in HTML content
                    if (!imageUrl) {
                        const imageRegex = /https?:\/\/[^\s"'<>]*\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]*)?/gi;
                        const matches = contentText.match(imageRegex);
                        if (matches && matches.length > 0) {
                            // Filter out likely thumbnails, avatars, and small images
                            const goodImages = matches.filter(url =>
                                !url.includes('thumbnail') &&
                                !url.includes('avatar') &&
                                !url.includes('icon') &&
                                !url.includes('logo') &&
                                (url.includes('large') || url.includes('medium') || url.includes('featured') || !url.includes('small'))
                            );

                            // Use the first good image, or fall back to first image if none are "good"
                            imageUrl = goodImages.length > 0 ? goodImages[0] : matches[0];
                        }
                    }
                } catch (e) {
                    // Continue to next content source if this one fails
                    continue;
                }
            }
        }

        // If no structured image found, try to extract from description/content (legacy fallback)
        if (!imageUrl && description) {
            // Look for img tags in description
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = description;

            // Look for various types of images in description
            let imgElement = tempDiv.querySelector('img.wp-post-image') ||
                            tempDiv.querySelector('img.attachment-large') ||
                            tempDiv.querySelector('img.featured') ||
                            tempDiv.querySelector('img[width]') || // Images with width attribute are likely featured
                            tempDiv.querySelector('img');

            if (imgElement) {
                imageUrl = imgElement.getAttribute('src') ||
                          imgElement.getAttribute('data-src') ||
                          imgElement.getAttribute('data-lazy-src');
            }

            // Also try to find image URLs in text content using regex
            if (!imageUrl) {
                const imageRegex = /https?:\/\/[^\s"'<>]*\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]*)?/gi;
                const matches = description.match(imageRegex);
                if (matches && matches.length > 0) {
                    // Prefer larger images and avoid thumbnails
                    for (let match of matches) {
                        if (!match.includes('thumbnail') && !match.includes('avatar') && !match.includes('icon') &&
                            (match.includes('large') || match.includes('medium') || !match.includes('small'))) {
                            imageUrl = match;
                            break;
                        }
                    }
                    // If no preferred image found, use the first one
                    if (!imageUrl) {
                        imageUrl = matches[0];
                    }
                }
            }
        }        // Validate and clean the image URL
        if (imageUrl) {
            imageUrl = imageUrl.trim();

            // Handle relative URLs - make them absolute if they start with /
            if (imageUrl.startsWith('/')) {
                // Get the domain from the item link or a default
                const itemLink = item.querySelector('link')?.textContent?.trim();
                if (itemLink) {
                    try {
                        const url = new URL(itemLink);
                        imageUrl = url.origin + imageUrl;
                    } catch (e) {
                        // If parsing fails, skip this image
                        imageUrl = null;
                    }
                }
            }

            // Make sure it's a valid image URL
            if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('//')) &&
                (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') ||
                 imageUrl.includes('.png') || imageUrl.includes('.gif') ||
                 imageUrl.includes('.webp') || imageUrl.includes('image'))) {
                return imageUrl;
            }
        }
    } catch (error) {
        // Silent error handling for image extraction
    }

    return null;
}

function fixTextEncoding(text) {
    if (!text) return text;

    // Create a temporary element to decode HTML entities
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    let decodedText = tempDiv.textContent || tempDiv.innerText || text;

    // Fix common encoding issues
    const encodingFixes = {
        'Ã©': 'é',
        'Ã¡': 'á',
        'Ã ': 'à',
        'Ã³': 'ó',
        'Ã­': 'í',
        'Ãº': 'ú',
        'Ã±': 'ñ',
        'Ã§': 'ç',
        'â€™': "'",
        'â€œ': '"',
        'â€': '"',
        'â€"': '—',
        'â€"': '–',
        'â€¢': '•',
        'â€²': '′',
        'â€³': '″',
        'Â': ' ',
        'âs': "'s", // specific fix for "oneâs" -> "one's"
        'âve': "'ve", // "Iâve" -> "I've"
        'âre': "'re", // "youâre" -> "you're"
        'âll': "'ll", // "Iâll" -> "I'll"
        'ât': "'t", // "donât" -> "don't"
        'âd': "'d", // "Iâd" -> "I'd"
        'âm': "'m", // "Iâm" -> "I'm"
        'â': "'",
        'Â´': "'",
        'Â`': "'",
        '\u2018': "'", // left single quotation mark
        '\u2019': "'", // right single quotation mark
        '\u201C': '"', // left double quotation mark
        '\u201D': '"', // right double quotation mark
        '\u2013': '-', // en dash
        '\u2014': '--', // em dash
        '\u2026': '...' // horizontal ellipsis
    };

    for (let [wrong, correct] of Object.entries(encodingFixes)) {
        decodedText = decodedText.replace(new RegExp(wrong, 'g'), correct);
    }

    return decodedText;
}

function getPlaceholderImage() {
    // Use controller-based icon as placeholder - relative path for file protocol compatibility
    return 'images/icon-96x96.png';
}

function cleanDescription(description) {
    if (!description) return '';

    // Fix encoding first
    description = fixTextEncoding(description);

    // Remove HTML tags and decode HTML entities
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = description;
    let cleanText = tempDiv.textContent || tempDiv.innerText || '';

    // Truncate to reasonable length
    if (cleanText.length > 200) {
        cleanText = cleanText.substring(0, 200) + '...';
    }

    return cleanText;
}

function getISODate(dateString) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toISOString();
    } catch (error) {
        return '';
    }
}

function formatDate(dateString) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) {
            return 'Just now';
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    } catch (error) {
        return dateString;
    }
}

function renderNewsSource(sourceData) {
    const { source, articles, error } = sourceData;

    const sourceElement = document.createElement('section');

    let content = `
        <div class="source-header">
            <h2 class="source-name">
                <a href="${source.homepage}" target="_blank" style="color: ${source.color}; text-decoration: none;">
                    ${source.name}
                </a>
            </h2>
        </div>
    `;

    if (error) {
        content += `
            <div class="error-message">
                ⚠️ Error loading news: ${error}
            </div>
        `;
    } else if (articles.length === 0) {
        content += `
            <div class="error-message">
                📰 No articles found
            </div>
        `;
    } else {
        content += '<div class="articles">';
        articles.forEach(article => {
            const imageUrl = article.imageUrl || getPlaceholderImage();
            const isPlaceholder = !article.imageUrl;
            // Simple error handling - just use placeholder on any error
            const imageHtml = `<img src="${imageUrl}" alt="${isPlaceholder ? 'Nintendo News placeholder' : ''}" class="article-image${isPlaceholder ? ' placeholder-image' : ''}" loading="lazy" onerror="this.src='images/icon-96x96.png'; this.onerror=null;">`;            content += `
                <article>
                    ${imageHtml}
                    <div class="article-content">
                        <h3 class="article-title">
                            <a href="${article.link}" target="_blank">
                                ${article.title}
                            </a>
                        </h3>
                        <div class="article-meta">
                            <time class="article-date" datetime="${getISODate(article.rawDate)}">${article.pubDate}</time>
                        </div>
                        ${article.description ? `<div class="article-description">${article.description}</div>` : ''}
                    </div>
                </article>
            `;
        });
        content += '</div>';
    }

    sourceElement.innerHTML = content;
    return sourceElement;
}

async function loadNews() {
    const loadingDiv = document.getElementById('loading');
    const newsContainer = document.getElementById('news-container');

    newsContainer.innerHTML = '';

    try {
        // Create placeholders for each source first
        newsSources.forEach(source => {
            const placeholder = document.createElement('section');
            placeholder.className = 'news-source loading-placeholder';
            placeholder.innerHTML = `
                <div class="source-header">
                    <h2 class="source-name">
                        <a href="${source.homepage}" target="_blank" style="color: ${source.color}; text-decoration: none;">
                            ${source.name}
                        </a>
                    </h2>
                    <div class="loading-spinner">⏳ Loading...</div>
                </div>
                <div class="articles-placeholder">
                    <div style="height: 320px; display: flex; align-items: center; justify-content: center; color: #888;">
                        <span class="loading-spinner">Loading articles...</span>
                    </div>
                </div>
            `;
            placeholder.id = `source-${source.name.replace(/\s+/g, '-').toLowerCase()}`;
            newsContainer.appendChild(placeholder);
        });

        // Fetch feeds with individual timeouts and progressive rendering
        const promises = newsSources.map(async (source, index) => {
            try {
                const result = await Promise.race([
                    fetchRSSFeed(source),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Individual timeout')), 15000)
                    )
                ]);

                // Render immediately when this source loads
                const placeholder = document.getElementById(`source-${source.name.replace(/\s+/g, '-').toLowerCase()}`);
                if (placeholder) {
                    // Update content in place to prevent layout shift
                    const articlesContainer = placeholder.querySelector('.articles-placeholder');
                    const loadingSpinner = placeholder.querySelector('.loading-spinner');

                    if (loadingSpinner) loadingSpinner.remove();

                    // Update the section class to final state
                    placeholder.className = 'news-source';

                    // Generate articles HTML
                    let articlesHtml = '<div class="articles">';
                    if (result.articles && result.articles.length > 0) {
                        result.articles.forEach(article => {
                            const imageUrl = proxyImageUrl(article.imageUrl) || getPlaceholderImage();
                            const isPlaceholder = !article.imageUrl;
                            articlesHtml += `
                                <article>
                                    <img src="${imageUrl}" alt="${isPlaceholder ? 'Nintendo News placeholder' : ''}" class="article-image${isPlaceholder ? ' placeholder-image' : ''}" loading="lazy" width="80" height="80" onerror="this.src='images/icon-96x96.png'; this.onerror=null;">
                                    <div class="article-content">
                                        <h3 class="article-title">
                                            <a href="${article.link}" target="_blank">
                                                ${article.title}
                                            </a>
                                        </h3>
                                        <div class="article-meta">
                                            <time class="article-date" datetime="${getISODate(article.rawDate)}">${article.pubDate}</time>
                                        </div>
                                        ${article.description ? `<div class="article-description">${article.description}</div>` : ''}
                                    </div>
                                </article>
                            `;
                        });
                    } else {
                        articlesHtml += '<div class="error-message">📰 No articles found</div>';
                    }
                    articlesHtml += '</div>';

                    // Replace placeholder content
                    if (articlesContainer) {
                        articlesContainer.innerHTML = articlesHtml;
                    }
                }

                return result;
            } catch (error) {
                // Render error state for this source
                const placeholder = document.getElementById(`source-${source.name.replace(/\s+/g, '-').toLowerCase()}`);
                if (placeholder) {
                    const articlesContainer = placeholder.querySelector('.articles-placeholder');
                    const loadingSpinner = placeholder.querySelector('.loading-spinner');

                    if (loadingSpinner) loadingSpinner.remove();
                    placeholder.className = 'news-source';

                    if (articlesContainer) {
                        articlesContainer.innerHTML = `
                            <div class="error-message">
                                ⚠️ Failed to load articles: ${error.message}
                            </div>
                        `;
                    }
                }
                return { source, articles: [], error: error.message };
            }
        });

        // Wait for all to complete (or timeout)
        await Promise.allSettled(promises);

    } catch (error) {
        loadingDiv.style.display = 'none';
        newsContainer.innerHTML = `
            <div class="error-message">
                ⚠️ Failed to load news. Please check your internet connection and try again.
            </div>
        `;
    }
}

// PWA Installation handling
let deferredPrompt;
let installButton;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
});

window.addEventListener('appinstalled', () => {
    hideInstallButton();
    deferredPrompt = null;
});

function showInstallButton() {
    if (!installButton) {
        installButton = document.createElement('button');
        installButton.textContent = '📱 Install App';
        installButton.className = 'install-button';
        installButton.onclick = installPWA;

        const header = document.querySelector('header');
        header.appendChild(installButton);
    }
}

function hideInstallButton() {
    if (installButton) {
        installButton.remove();
        installButton = null;
    }
}

async function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        hideInstallButton();
    }
}

// Performance optimized initialization
function initializeApp() {
    // Use requestIdleCallback for non-critical operations
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            // Pre-warm the feed cache in background
            setTimeout(() => {
                if (navigator.onLine) {
                    // Pre-warming feed cache
                }
            }, 2000);

            // Schedule cache cleanup
            scheduleCacheCleanup();
        });
    }

    loadNews();
}

// Cache management - trigger service worker cleanup
function scheduleCacheCleanup() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Send cache cleanup message to service worker every hour
        const cleanupInterval = setInterval(() => {
            navigator.serviceWorker.controller.postMessage({
                type: 'CLEAN_CACHE'
            });
        }, 60 * 60 * 1000); // 1 hour

        // Initial cleanup after 5 minutes
        setTimeout(() => {
            navigator.serviceWorker.controller.postMessage({
                type: 'CLEAN_CACHE'
            });
        }, 5 * 60 * 1000);
    }
}

// Cache performance monitoring
function reportCachePerformance() {
    if ('performance' in window && 'getEntriesByType' in performance) {
        const resourceEntries = performance.getEntriesByType('resource');
        const cachedResources = resourceEntries.filter(entry =>
            entry.transferSize === 0 && entry.decodedBodySize > 0
        );
        // Cache performance metrics collected
    }
}

// Load news when page loads - optimize for async script loading
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // Script loaded after DOM is ready
    initializeApp();
}

// Report cache performance after page load
window.addEventListener('load', () => {
    setTimeout(reportCachePerformance, 2000);
});