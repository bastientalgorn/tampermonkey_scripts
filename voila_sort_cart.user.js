// ==UserScript==
// @name         Voila Product Categories
// @namespace    http://tampermonkey.net/
// @version      7.4
// @description  Displays product categories from __INITIAL_STATE__ under product names with auto-sorting
// @match        https://*.voila.ca/orders*
// @match        https://*.voila.ca/basket*
// @match        https://voila.ca/orders*
// @match        https://voila.ca/basket*
// @match        http://*.voila.ca/orders*
// @match        http://*.voila.ca/basket*
// @match        http://voila.ca/orders*
// @match        http://voila.ca/basket*
// @exclude      https://*.voila.ca/checkout/checkout-walk/*
// @exclude      https://voila.ca/checkout/checkout-walk/*
// @exclude      http://*.voila.ca/checkout/checkout-walk/*
// @exclude      http://voila.ca/checkout/checkout-walk/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================================
    // CONSTANTS
    // ============================================================================
    
    const CACHE_KEY = 'voila_product_categories';
    
    // Selectors
    const SELECTORS = {
        PRODUCT_LINK: 'a[data-test="fop-product-link"]',
        TITLE_CONTAINER: '.title-container',
        PROMOTION_CONTAINER: '.promotion-container[data-retailer-anchor="fop-promotions"]',
        PRODUCT_WRAPPER: '[data-test^="fop-wrapper:"]',
        CATEGORY_TEXT: '.custom-category-text',
        INITIAL_STATE_SCRIPT: 'script[data-test="initial-state-script"]'
    };
    
    // Colors for category sources
    const COLORS = {
        CACHE: '#4caf50',      // Green
        FETCHED: '#1976d2',    // Blue
        ERROR: '#ff9800',      // Orange
        NOT_FOUND: '#d32f2f',  // Red
        LOADING: '#666'        // Gray
    };
    
    // Button styling
    const BUTTON_STYLES = {
        PRIMARY_BG: '#004740',
        PRIMARY_HOVER_BG: '#00201c',
        TEXT_COLOR: '#fff',
        FONT_FAMILY: 'FoundersGroteskWeb, sans-serif'
    };
    
    // Timing delays (in milliseconds)
    const DELAYS = {
        INITIAL_LOAD: 1000,
        BUTTON_CREATE: 200,
        STATUS_UPDATE_SHORT: 50,
        STATUS_UPDATE_LONG: 100,
        AUTO_SORT: 500,
        SORT_FEEDBACK: 2000,
        AUTO_SORT_RESET: 5000
    };

    // ============================================================================
    // STATE
    // ============================================================================
    
    let sortButton = null;
    let autoSortTriggered = false;
    let totalItems = 0;
    let readyItems = 0;
    const categoryCache = loadCache();

    // ============================================================================
    // CACHE MANAGEMENT
    // ============================================================================
    
    /**
     * Load category cache from Tampermonkey storage
     * @returns {Object} Cache object with product names as keys
     */
    function loadCache() {
        try {
            const cached = GM_getValue(CACHE_KEY, '{}');
            return JSON.parse(cached);
        } catch (e) {
            console.error('Failed to load cache:', e);
            return {};
        }
    }
    
    /**
     * Save category cache to Tampermonkey storage
     * @param {Object} cache - Cache object to save
     */
    function saveCache(cache) {
        try {
            GM_setValue(CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            console.error('Failed to save cache:', e);
        }
    }

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================
    
    /**
     * Extract product name from product link element
     * @param {HTMLElement} productLink - Product link element
     * @returns {string} Product name or 'unknown'
     */
    function getProductName(productLink) {
        return productLink.textContent.trim() || 
               productLink.getAttribute('aria-label') || 
               productLink.getAttribute('title') || 
               'unknown';
    }
    
    /**
     * Recursively find categoryPath in nested object
     * @param {Object} obj - Object to search
     * @returns {Array|string|null} Category path if found
     */
    function findCategoryPath(obj) {
        if (!obj || typeof obj !== 'object') {
            return null;
        }
        
        if (obj.categoryPath) {
            return obj.categoryPath;
        }
        
        for (const key in obj) {
            const result = findCategoryPath(obj[key]);
            if (result) return result;
        }
        
        return null;
    }
    
    /**
     * Format category path into display string
     * @param {Array|string|*} categoryPath - Category path from API
     * @returns {string} Formatted category string
     */
    function formatCategoryPath(categoryPath) {
        if (Array.isArray(categoryPath)) {
            return categoryPath.join(' > ');
        }
        if (typeof categoryPath === 'string') {
            return categoryPath;
        }
        return JSON.stringify(categoryPath);
    }

    // ============================================================================
    // CATEGORY FETCHING
    // ============================================================================
    
    /**
     * Fetch category from product page HTML
     * @param {string} productUrl - URL of product page
     * @param {Function} callback - Callback with result
     */
    function fetchCategoryFromProductPage(productUrl, callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: productUrl,
            onload: function(response) {
                const html = response.responseText;
                const initialStateMatch = html.match(/<script[^>]*data-test="initial-state-script"[^>]*>([\s\S]*?)<\/script>/);
                
                if (!initialStateMatch || !initialStateMatch[1]) {
                    callback({ success: false, error: 'no category found' });
                    return;
                }
                
                try {
                    const scriptContent = initialStateMatch[1];
                    
                    if (!scriptContent.includes('window.__INITIAL_STATE__')) {
                        callback({ success: false, error: 'no category found' });
                        return;
                    }
                    
                    const jsonMatch = scriptContent.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*$/);
                    
                    if (!jsonMatch || !jsonMatch[1]) {
                        callback({ success: false, error: 'parse error' });
                        return;
                    }
                    
                    const initialState = JSON.parse(jsonMatch[1]);
                    const categoryPath = findCategoryPath(initialState);
                    
                    if (categoryPath) {
                        const categoryText = formatCategoryPath(categoryPath);
                        callback({ success: true, category: categoryText });
                    } else {
                        callback({ success: false, error: 'no category found' });
                    }
                } catch (e) {
                    console.error('Failed to parse initial state:', e);
                    callback({ success: false, error: 'parse error' });
                }
            },
            onerror: function(error) {
                console.error('Failed to fetch:', productUrl, error);
                callback({ success: false, error: 'fetch error' });
            }
        });
    }
    
    /**
     * Get category for a product (checks cache first, then fetches)
     * @param {string} productName - Product name (cache key)
     * @param {string} productUrl - Product URL
     * @returns {Promise<{category: string, source: string}>}
     */
    function getCategoryForProduct(productName, productUrl) {
        return new Promise((resolve) => {
            // Check cache first
            if (categoryCache[productName]) {
                resolve({ category: categoryCache[productName], source: 'cache' });
                return;
            }
            
            // Fetch from server
            fetchCategoryFromProductPage(productUrl, function(result) {
                if (result.success) {
                    categoryCache[productName] = result.category;
                    saveCache(categoryCache);
                    resolve({ category: result.category, source: 'fetched' });
                } else {
                    const source = result.error === 'no category found' ? 'not_found' : 'error';
                    resolve({ category: result.error, source: source });
                }
            });
        });
    }

    // ============================================================================
    // DOM MANIPULATION
    // ============================================================================
    
    /**
     * Display category text with color coding
     * @param {HTMLElement} categoryDiv - Category display element
     * @param {string} categoryText - Category text to display
     * @param {string} source - Source of category (cache, fetched, error, not_found)
     */
    function displayCategory(categoryDiv, categoryText, source) {
        categoryDiv.textContent = categoryText;
        categoryDiv.style.color = COLORS[source.toUpperCase()] || COLORS.LOADING;
    }
    
    /**
     * Apply CSS truncation styles to product links
     */
    function styleProductLinks() {
        const productLinks = document.querySelectorAll(SELECTORS.PRODUCT_LINK);
        
        productLinks.forEach(link => {
            if (link.style.webkitLineClamp) return; // Already styled
            
            link.style.display = '-webkit-box';
            link.style.webkitBoxOrient = 'vertical';
            link.style.webkitLineClamp = '3';
            link.style.overflow = 'hidden';
            link.style.textOverflow = 'ellipsis';
            link.style.maxHeight = 'calc(3 * 1.5em)';
        });
    }
    
    /**
     * Remove promotion containers from products
     */
    function removePromotions() {
        const promotionContainers = document.querySelectorAll(SELECTORS.PROMOTION_CONTAINER);
        promotionContainers.forEach(container => container.remove());
    }
    
    /**
     * Add padding around product items
     */
    function styleProductBorders() {
        const productWrappers = document.querySelectorAll(SELECTORS.PRODUCT_WRAPPER);
        
        productWrappers.forEach(wrapper => {
            if (wrapper.dataset.borderStyled) return; // Already styled
            
            wrapper.style.padding = '8px';
            wrapper.dataset.borderStyled = 'true';
        });
    }
    
    /**
     * Add category labels to products
     */
    function addCategoriesToProducts() {
        const titleContainers = document.querySelectorAll(SELECTORS.TITLE_CONTAINER);
        let newProductsAdded = false;
        
        titleContainers.forEach(container => {
            // Skip if already processed
            if (container.querySelector(SELECTORS.CATEGORY_TEXT)) return;
            
            const productLink = container.querySelector(SELECTORS.PRODUCT_LINK);
            if (!productLink) return;
            
            newProductsAdded = true;
            
            const productName = getProductName(productLink);
            const productUrl = productLink.href;
            
            // Create category display element
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'custom-category-text';
            categoryDiv.textContent = 'loading...';
            categoryDiv.style.fontSize = '12px';
            categoryDiv.style.color = COLORS.LOADING;
            categoryDiv.style.marginTop = '4px';
            categoryDiv.style.fontStyle = 'italic';
            
            container.appendChild(categoryDiv);
            
            // Fetch and display category
            getCategoryForProduct(productName, productUrl).then(result => {
                displayCategory(categoryDiv, result.category, result.source);
                setTimeout(updateStatus, DELAYS.STATUS_UPDATE_SHORT);
            });
        });
        
        if (newProductsAdded) {
            setTimeout(updateStatus, DELAYS.STATUS_UPDATE_LONG);
        }
    }

    // ============================================================================
    // SORTING
    // ============================================================================
    
    /**
     * Sort cart items by category alphabetically
     */
    function sortCartItems() {
        const items = Array.from(document.querySelectorAll(SELECTORS.PRODUCT_WRAPPER));
        
        if (items.length === 0) {
            console.log('No items found to sort');
            return;
        }
        
        // Map items with their categories
        const mapped = items.map(item => {
            const categoryDiv = item.querySelector(SELECTORS.CATEGORY_TEXT);
            if (!categoryDiv) return null;
            
            let category = categoryDiv.textContent.trim();
            
            // Sort loading/error items to end
            if (category === 'loading...' || 
                category.includes('error') || 
                category.includes('not found')) {
                category = 'ZZZ_' + category;
            }
            
            return { element: item, category };
        }).filter(Boolean);
        
        // Sort alphabetically
        mapped.sort((a, b) => a.category.localeCompare(b.category));
        
        // Reorder DOM
        const parent = items[0].parentNode;
        mapped.forEach(obj => parent.appendChild(obj.element));
        
        console.log(`Sorted ${mapped.length} items by category`);
        
        // Update button feedback
        if (sortButton) {
            sortButton.textContent = '✓ Sorted!';
            setTimeout(() => {
                updateButtonText();
            }, DELAYS.SORT_FEEDBACK);
        }
    }

    // ============================================================================
    // STATUS TRACKING
    // ============================================================================
    
    /**
     * Update item counts from DOM
     */
    function updateItemCounts() {
        const allCategoryDivs = document.querySelectorAll(SELECTORS.CATEGORY_TEXT);
        totalItems = allCategoryDivs.length;
        readyItems = Array.from(allCategoryDivs).filter(div => {
            return div.textContent.trim() !== 'loading...';
        }).length;
    }
    
    /**
     * Update button text based on current state
     */
    function updateButtonText() {
        if (!sortButton) return;
        sortButton.textContent = 'Sort by Category';
    }
    
    /**
     * Check if auto-sort should trigger
     */
    function checkAutoSort() {
        if (readyItems === totalItems && totalItems > 0 && !autoSortTriggered) {
            autoSortTriggered = true;
            console.log(`Auto-sorting: all ${totalItems} items ready`);
            
            setTimeout(() => {
                sortCartItems();
                setTimeout(() => {
                    autoSortTriggered = false;
                }, DELAYS.AUTO_SORT_RESET);
            }, DELAYS.AUTO_SORT);
        }
    }
    
    /**
     * Main status update - updates counts, button, and checks auto-sort
     */
    function updateStatus() {
        updateItemCounts();
        updateButtonText();
        checkAutoSort();
    }

    // ============================================================================
    // UI - SORT BUTTON
    // ============================================================================
    
    /**
     * Create and style the sort button
     */
    function createSortButton() {
        if (sortButton) return; // Already created
        
        // Don't create button if there are no items
        if (totalItems === 0) return;
        
        sortButton = document.createElement('button');
        sortButton.id = 'voila-sort-button';
        sortButton.textContent = 'Sort by Category';
        
        // Apply styles
        Object.assign(sortButton.style, {
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            zIndex: '10000',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 'bold',
            backgroundColor: BUTTON_STYLES.PRIMARY_BG,
            color: BUTTON_STYLES.TEXT_COLOR,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0px 2px 12px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.3s ease',
            fontFamily: BUTTON_STYLES.FONT_FAMILY
        });
        
        // Hover effects
        sortButton.addEventListener('mouseenter', function() {
            this.style.backgroundColor = BUTTON_STYLES.PRIMARY_HOVER_BG;
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0px 4px 16px rgba(0, 0, 0, 0.3)';
        });
        
        sortButton.addEventListener('mouseleave', function() {
            this.style.backgroundColor = BUTTON_STYLES.PRIMARY_BG;
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0px 2px 12px rgba(0, 0, 0, 0.2)';
        });
        
        // Click handler
        sortButton.addEventListener('click', sortCartItems);
        
        document.body.appendChild(sortButton);
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    /**
     * Initialize the script on page load
     */
    function initialize() {
        styleProductLinks();
        styleProductBorders();
        removePromotions();
        addCategoriesToProducts();
        setTimeout(createSortButton, DELAYS.BUTTON_CREATE);
    }
    
    /**
     * Handle dynamic content updates
     */
    function handleDynamicUpdates() {
        styleProductLinks();
        styleProductBorders();
        removePromotions();
        addCategoriesToProducts();
    }
    
    // Run on page load
    setTimeout(initialize, DELAYS.INITIAL_LOAD);
    
    // Watch for dynamically loaded products
    const observer = new MutationObserver(handleDynamicUpdates);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // ============================================================================
    // URL CHANGE DETECTION
    // ============================================================================
    
    /**
     * Check if current URL matches script's target pages
     * @returns {boolean} True if URL should run the script
     */
    function shouldRunOnCurrentUrl() {
        const url = window.location.href;
        const isOrdersOrBasket = url.includes('/orders') || url.includes('/basket');
        const isCheckout = url.includes('/checkout/checkout-walk/');
        return isOrdersOrBasket && !isCheckout;
    }
    
    /**
     * Reset script state for new page
     */
    function resetScriptState() {
        console.log('[Voila Script] Resetting state for new page');
        
        // Remove existing button if present
        if (sortButton && sortButton.parentNode) {
            sortButton.parentNode.removeChild(sortButton);
        }
        sortButton = null;
        autoSortTriggered = false;
        totalItems = 0;
        readyItems = 0;
        
        // Remove old category labels
        const oldCategories = document.querySelectorAll(SELECTORS.CATEGORY_TEXT);
        oldCategories.forEach(cat => cat.remove());
        
        // Re-initialize
        setTimeout(initialize, DELAYS.INITIAL_LOAD);
    }
    
    /**
     * Handle URL change
     */
    function handleUrlChange() {
        const currentUrl = window.location.href;
        console.log('[Voila Script] URL changed to:', currentUrl);
        
        if (shouldRunOnCurrentUrl()) {
            console.log('[Voila Script] Re-initializing script for new URL');
            resetScriptState();
        } else if (sortButton) {
            // Remove button if navigated away from target pages
            console.log('[Voila Script] Removing button - not on target page');
            if (sortButton.parentNode) {
                sortButton.parentNode.removeChild(sortButton);
            }
            sortButton = null;
        }
    }
    
    // Monitor URL changes using multiple methods for better compatibility
    let lastUrl = window.location.href;
    
    // Method 1: Intercept pushState and replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        handleUrlChange();
    };
    
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        handleUrlChange();
    };
    
    // Method 2: Listen to popstate event
    window.addEventListener('popstate', handleUrlChange);
    
    // Method 3: Polling as fallback (for cases where history API isn't used)
    setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            handleUrlChange();
        }
    }, 500);
})();
