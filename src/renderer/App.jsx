import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import logo from './assets/logo.png';
import QRCode from 'qrcode';
import {
    calculatePurchaseLine,
    calculateSaleLine,
    calculateAverageCost,
    companyNames,
    defaultTaxSettings,
    expenseCategories,
    formatCurrency,
    formatDateShort,
    formatQuantity,
    productCategories,
    roundMoney,
    saleStatuses,
    salesChannels,
    toNumber,
    toDateInputValue
} from '../shared/finance.js';

function createLocalId(prefix = 'id') {
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${token}`;
}

function ProductSearchSelect({ products, value, onChange, onCreateNew, placeholder = "Choose a product" }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    const selectedProduct = products.find(p => p.id === value);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return products.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q)
        ).slice(0, 50);
    }, [products, search]);

    const searchTrimmed = search.trim();
    const canQuickAdd = onCreateNew && searchTrimmed.length > 0 && !products.some(
        p => p.name.toLowerCase() === searchTrimmed.toLowerCase()
    );

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        const next = !isOpen;
        setIsOpen(next);
        if (next) {
            setSearch('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleSelect = (product) => {
        onChange(product.id);
        setIsOpen(false);
    };

    const handleQuickAdd = async () => {
        if (!searchTrimmed || creating) return;
        setCreating(true);
        try {
            await onCreateNew(searchTrimmed);
            setIsOpen(false);
        } catch (err) {
            console.error('Failed to trigger product creation modal:', err);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="search-select-wrapper" ref={wrapperRef}>
            <div className="search-select-trigger" onClick={handleToggle}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedProduct ? selectedProduct.name : placeholder}
                </span>
                <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: 8 }}>▼</span>
            </div>

            {isOpen && (
                <div className="search-select-dropdown">
                    <div className="search-select-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="search-select-input"
                            placeholder="Search by name or code..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setIsOpen(false);
                                }
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (canQuickAdd) handleQuickAdd();
                                }
                            }}
                        />
                    </div>
                    <div className="search-select-list">
                        {filtered.length > 0 ? (
                            filtered.map(product => (
                                <div
                                    key={product.id}
                                    className={`search-select-item ${product.id === value ? 'selected' : ''}`}
                                    onClick={() => handleSelect(product)}
                                >
                                    <div className="search-item-info">
                                        <span className="search-item-name">{product.name}</span>
                                        <span className="search-item-code">{product.code}</span>
                                    </div>
                                    <div className="search-item-meta">
                                        <span className={`search-item-stock ${product.stockQty <= (product.reorderPoint ?? 10) ? 'low' : 'ok'}`}>
                                            {formatQuantity(product.stockQty)} {product.unit} in stock
                                        </span>
                                        <span className="search-item-price">{formatCurrency(product.srp)}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            searchTrimmed !== '' && !canQuickAdd && <div className="search-select-empty">No products found.</div>
                        )}
                        {canQuickAdd && (
                            <div
                                className="search-select-item"
                                style={{
                                    borderTop: filtered.length > 0 ? '1px solid var(--border)' : 'none',
                                    color: 'var(--primary)',
                                    fontWeight: 600,
                                    gap: '8px',
                                    opacity: creating ? 0.6 : 1,
                                    cursor: creating ? 'not-allowed' : 'pointer'
                                }}
                                onClick={handleQuickAdd}
                            >
                                <span style={{ fontSize: '1.1em' }}>＋</span>
                                <span>{creating ? 'Saving...' : `Add "${searchTrimmed}" as new product`}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function PurchaseItemRow({ item, index, products, supplierProducts, onUpdate, onRemove, onUploadPhoto, isLast }) {
    const [searchTerm, setSearchTerm] = useState(item.product_code || item.product_name || '');
    const [showDropdown, setShowDropdown] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const dropdownRef = useRef(null);

    const filteredProducts = useMemo(() => {
        let filtered = products;
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = products.filter(p =>
                p.code?.toLowerCase().includes(q) ||
                p.name?.toLowerCase().includes(q)
            );
        }

        if (supplierProducts && (supplierProducts.ids.size > 0 || supplierProducts.codes.size > 0)) {
            filtered = [...filtered].sort((a, b) => {
                const aIsSupplier = supplierProducts.ids.has(a.id) || supplierProducts.codes.has(a.code);
                const bIsSupplier = supplierProducts.ids.has(b.id) || supplierProducts.codes.has(b.code);
                if (aIsSupplier && !bIsSupplier) return -1;
                if (!aIsSupplier && bIsSupplier) return 1;
                return 0;
            });
        }

        return filtered.slice(0, 10);
    }, [products, searchTerm, supplierProducts]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (p) => {
        if (p === 'new') {
            onUpdate(index, {
                is_new_product: true,
                product_id: '',
                product_code: searchTerm,
                product_name: searchTerm,
                category: productCategories[0],
                unit: 'pc'
            });
        } else {
            onUpdate(index, {
                product_id: p.id,
                product_code: p.code,
                product_name: p.name,
                description: p.name || p.description || '',
                unit: p.unit,
                unit_cost: String(p.average_cost || p.cost || 0),
                srp: String(p.srp || 0),
                is_new_product: false
            });
            setSearchTerm(p.code);
        }
        setShowDropdown(false);
    };

    return (
        <>
            <tr className={`purchase-entry-row ${item.is_new_product ? 'row-new' : ''}`}>
                <td className="text-dim small" style={{ width: '28px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
                    {index + 1}
                </td>
                <td style={{ position: 'relative', width: '200px', borderBottom: '1px solid var(--border)' }} ref={dropdownRef}>
                    <div className="search-input-wrapper">
                        <input
                            className="input input-compact no-border search-field"
                            value={searchTerm}
                            placeholder="Search product..."
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setShowDropdown(true);
                                if (!item.product_id) {
                                    onUpdate(index, { product_name: e.target.value });
                                }
                            }}
                            onFocus={() => setShowDropdown(true)}
                        />
                    </div>
                    {showDropdown && (
                        <div className="search-select-dropdown premium-dropdown" style={{ top: 'auto', bottom: 'calc(100% + 4px)', left: 0, right: 0, minWidth: '420px', zIndex: 1000 }}>
                            <div className="dropdown-scroll-area">
                                {filteredProducts.map(p => {
                                    const isSupplierProduct = supplierProducts && (supplierProducts.ids.has(p.id) || supplierProducts.codes.has(p.code));
                                    return (
                                        <div key={p.id} className="search-select-item premium-item" onClick={() => handleSelect(p)}>
                                            <div className="item-main">
                                                <div className="item-icon">
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                                                        <polyline points="3.29 7 12 12 20.71 7"></polyline>
                                                        <line x1="12" y1="22" x2="12" y2="12"></line>
                                                    </svg>
                                                </div>
                                                <div className="item-details">
                                                    <div className="item-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {p.name}
                                                        {isSupplierProduct && (
                                                            <span style={{
                                                                fontSize: '0.62rem',
                                                                background: 'var(--primary-fade)',
                                                                color: 'var(--primary-strong)',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                fontWeight: 'bold',
                                                                letterSpacing: '0.02em',
                                                                textTransform: 'uppercase'
                                                            }}>
                                                                Supplier Product
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="item-meta">
                                                        <span className="item-code">{p.code}</span>
                                                        <span className="dot">•</span>
                                                        <span className="item-stock">{p.stockQty} {p.unit} in stock</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="item-price">{formatCurrency(p.average_cost || p.cost)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            {searchTerm.trim() && (
                                <div
                                    className="search-select-item create-new-item"
                                    onClick={() => handleSelect('new')}
                                >
                                    <div className="create-icon">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                        </svg>
                                    </div>
                                    <div className="create-text">Create <strong>"{searchTerm}"</strong> as new product</div>
                                </div>
                            )}
                        </div>
                    )}
                </td>
                <td style={{ borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            className="input input-compact no-border description-field"
                            value={item.product_name || ''}
                            placeholder="Product Name"
                            onChange={(e) => onUpdate(index, { product_name: e.target.value })}
                        />
                        {item.is_new_product && <span className="badge-premium-new">NEW</span>}
                    </div>
                </td>
                <td style={{ width: '80px', borderBottom: '1px solid var(--border)' }}>
                    <input
                        className="input input-compact text-right no-border qty-field"
                        type="number"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => onUpdate(index, { quantity: e.target.value })}
                    />
                </td>
                <td style={{ width: '70px', borderBottom: '1px solid var(--border)' }}>
                    <input
                        className="input input-compact no-border unit-field"
                        value={item.unit}
                        placeholder="pc"
                        onChange={(e) => onUpdate(index, { unit: e.target.value })}
                    />
                </td>
                <td style={{ width: '100px', borderBottom: '1px solid var(--border)' }}>
                    <input
                        className="input input-compact text-right no-border price-field"
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => onUpdate(index, { unit_cost: e.target.value })}
                    />
                </td>
                <td style={{ width: '100px', borderBottom: '1px solid var(--border)' }}>
                    <input
                        className="input input-compact text-right no-border price-field"
                        type="number"
                        step="0.01"
                        value={item.srp}
                        onChange={(e) => onUpdate(index, { srp: e.target.value })}
                    />
                </td>
                <td className="text-right amount-cell" style={{ verticalAlign: 'middle', paddingRight: '12px', width: '120px', borderBottom: '1px solid var(--border)' }}>
                    {formatCurrency(item.gross_amount)}
                </td>
                <td style={{ textAlign: 'center', width: '70px', borderBottom: '1px solid var(--border)' }}>
                    <div className="row-actions">
                        <button
                            className={`action-btn toggle-btn ${showAdvanced ? 'active' : ''}`}
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            title="Advanced Details"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                        </button>
                        {!isLast && (
                            <button className="action-btn delete-btn" type="button" onClick={() => onRemove(index)} title="Remove row">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            {showAdvanced && (
                <tr className={item.is_new_product ? 'row-new advanced-options-row' : 'advanced-options-row'}>
                    <td colSpan="9" style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.015)', borderTop: 'none', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                            <label className="field" style={{ margin: 0 }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>Sack weight (kg) (optional)</span>
                                <input
                                    className="input input-compact"
                                    type="number"
                                    placeholder="e.g. 50"
                                    value={item.sack_weight_kg || ''}
                                    onChange={(e) => onUpdate(index, { sack_weight_kg: e.target.value })}
                                />
                            </label>
                            <label className="field" style={{ margin: 0 }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>Price per kg (optional)</span>
                                <input
                                    className="input input-compact"
                                    type="number"
                                    placeholder="e.g. 15.50"
                                    value={item.price_per_kg || ''}
                                    onChange={(e) => onUpdate(index, { price_per_kg: e.target.value })}
                                />
                            </label>
                            <label className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>Upload image</span>
                                <div className="file-upload" style={{ marginTop: '4px' }}>
                                    <label className="upload-button" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                                        Choose image
                                        <input
                                            className="file-input"
                                            type="file"
                                            accept="image/*"
                                            onChange={onUploadPhoto}
                                        />
                                    </label>
                                    {item.photo_path ? (
                                        <div className="photo-preview" style={{ marginTop: '8px', maxWidth: '80px', maxHeight: '80px' }}>
                                            <img src={window.agriLedger.sync.resolvePhotoUrl(item.photo_path)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                        </div>
                                    ) : (
                                        <span className="muted" style={{ fontSize: '0.7rem', marginLeft: '8px' }}>No image selected</span>
                                    )}
                                </div>
                            </label>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

function SupplierSearchSelect({ suppliers, value, onChange, onCreateNew, placeholder = "Type or choose a supplier" }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState(value || '');
    const [creating, setCreating] = useState(false);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    const selectedSupplier = suppliers.find(s => s.name === value);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return suppliers.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.contactNumber && s.contactNumber.toLowerCase().includes(q)) ||
            (s.tin && s.tin.toLowerCase().includes(q))
        ).slice(0, 50);
    }, [suppliers, search]);

    const searchTrimmed = search.trim();
    // Allow quick add if name doesn't exist yet
    const canQuickAdd = onCreateNew && searchTrimmed.length > 0 && !suppliers.some(
        s => s.name.toLowerCase() === searchTrimmed.toLowerCase()
    );

    useEffect(() => {
        setSearch(value || '');
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        const next = !isOpen;
        setIsOpen(next);
        if (next) {
            setSearch(value || '');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleSelect = (supplier) => {
        if (supplier) {
            onChange(supplier.name, supplier.tin || '', supplier.address || '');
        } else {
            // If they just typed a name and didn't select, we treat it as a custom name
            onChange(searchTrimmed, '', '');
        }
        setIsOpen(false);
    };

    const handleQuickAdd = async () => {
        if (!searchTrimmed || creating) return;
        setCreating(true);
        try {
            await onCreateNew(searchTrimmed);
            setIsOpen(false);
        } catch (err) {
            console.error('Failed to trigger supplier creation modal:', err);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="search-select-wrapper" ref={wrapperRef}>
            <div className="search-select-trigger" onClick={handleToggle}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {value || placeholder}
                </span>
                <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: 8 }}>▼</span>
            </div>

            {isOpen && (
                <div className="search-select-dropdown">
                    <div className="search-select-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="search-select-input"
                            placeholder="Search or type new name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setIsOpen(false);
                                }
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (canQuickAdd) handleQuickAdd();
                                    else if (filtered.length > 0) handleSelect(filtered[0]);
                                    else handleSelect(null);
                                }
                            }}
                            onBlur={() => {
                                // If they click away, we don't automatically select unless they explicitly clicked or hit enter
                            }}
                        />
                    </div>
                    <div className="search-select-list">
                        {filtered.length > 0 ? (
                            filtered.map(supplier => (
                                <div
                                    key={supplier.id}
                                    className={`search-select-item ${supplier.name === value ? 'selected' : ''}`}
                                    onClick={() => handleSelect(supplier)}
                                >
                                    <div className="search-item-info">
                                        <span className="search-item-name">{supplier.name}</span>
                                        <span className="search-item-code">{supplier.contactNumber || 'No contact'}</span>
                                    </div>
                                    <div className="search-item-meta" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                                        <span className="search-item-price">{supplier.tin ? `TIN: ${supplier.tin}` : ''}</span>
                                        {supplier.address && (
                                            <span className="search-item-address" style={{ fontSize: '0.7rem', opacity: 0.7, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {supplier.address}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            searchTrimmed !== '' && !canQuickAdd && <div className="search-select-empty">No suppliers found.</div>
                        )}
                        {canQuickAdd && (
                            <div
                                className="search-select-item"
                                style={{
                                    borderTop: filtered.length > 0 ? '1px solid var(--border)' : 'none',
                                    color: 'var(--primary)',
                                    fontWeight: 600,
                                    gap: '8px',
                                    opacity: creating ? 0.6 : 1,
                                    cursor: creating ? 'not-allowed' : 'pointer'
                                }}
                                onClick={handleQuickAdd}
                            >
                                <span style={{ fontSize: '1.1em' }}>＋</span>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span>{creating ? 'Saving...' : `Add "${searchTrimmed}" to Suppliers`}</span>
                                    <small style={{ fontWeight: 400, opacity: 0.8, fontSize: '0.75rem' }}>Full profile will be auto-saved on submit</small>
                                </div>
                            </div>
                        )}
                        {searchTrimmed !== '' && !canQuickAdd && !filtered.some(s => s.name === searchTrimmed) && (
                            <div className="search-select-item" onClick={() => handleSelect(null)}>
                                <span>Use custom name: <strong>"{searchTrimmed}"</strong></span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function CustomerSearchSelect({ customers, value, onChange, onCreateNew, placeholder = "Choose a customer" }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    const selectedCustomer = customers.find(c => c.id === value);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.contactNumber && c.contactNumber.toLowerCase().includes(q)) ||
            (c.tin && c.tin.toLowerCase().includes(q))
        ).slice(0, 50);
    }, [customers, search]);

    // Show quick-add option when search text doesn't exactly match any existing customer name
    const searchTrimmed = search.trim();
    const canQuickAdd = onCreateNew && searchTrimmed.length > 0 && !customers.some(
        c => c.name.toLowerCase() === searchTrimmed.toLowerCase()
    );

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        const next = !isOpen;
        setIsOpen(next);
        if (next) {
            setSearch('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleSelect = (customer) => {
        onChange(customer ? customer.id : '');
        setIsOpen(false);
    };

    const handleQuickAdd = async () => {
        if (!searchTrimmed || creating) return;
        setCreating(true);
        try {
            await onCreateNew(searchTrimmed);
            setIsOpen(false);
        } catch (err) {
            console.error('Failed to trigger customer creation modal:', err);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="search-select-wrapper" ref={wrapperRef}>
            <div className="search-select-trigger" onClick={handleToggle}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedCustomer ? selectedCustomer.name : 'Walk-in / no customer'}
                </span>
                <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: 8 }}>▼</span>
            </div>

            {isOpen && (
                <div className="search-select-dropdown">
                    <div className="search-select-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="search-select-input"
                            placeholder="Search by name, contact, or TIN..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setIsOpen(false);
                                }
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (canQuickAdd) handleQuickAdd();
                                }
                            }}
                        />
                    </div>
                    <div className="search-select-list">
                        <div
                            className={`search-select-item ${value === '' ? 'selected' : ''}`}
                            onClick={() => handleSelect(null)}
                        >
                            <div className="search-item-info">
                                <span className="search-item-name">Walk-in / no customer</span>
                            </div>
                        </div>
                        {filtered.length > 0 ? (
                            filtered.map(customer => (
                                <div
                                    key={customer.id}
                                    className={`search-select-item ${customer.id === value ? 'selected' : ''}`}
                                    onClick={() => handleSelect(customer)}
                                >
                                    <div className="search-item-info">
                                        <span className="search-item-name">{customer.name}</span>
                                        <span className="search-item-code">{customer.contactNumber || 'No contact'}</span>
                                    </div>
                                    <div className="search-item-meta">
                                        <span className="search-item-price">{customer.tin ? `TIN: ${customer.tin}` : ''}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            searchTrimmed !== '' && !canQuickAdd && <div className="search-select-empty">No customers found.</div>
                        )}
                        {canQuickAdd && (
                            <div
                                className="search-select-item"
                                style={{
                                    borderTop: filtered.length > 0 ? '1px solid var(--border)' : 'none',
                                    color: 'var(--primary)',
                                    fontWeight: 600,
                                    gap: '8px',
                                    opacity: creating ? 0.6 : 1,
                                    cursor: creating ? 'not-allowed' : 'pointer'
                                }}
                                onClick={handleQuickAdd}
                            >
                                <span style={{ fontSize: '1.1em' }}>＋</span>
                                <span>{creating ? 'Saving...' : `Add "${searchTrimmed}" as new customer`}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


function blankProductForm() {
    return {
        id: '',
        code: '',
        name: '',
        description: '',
        category: productCategories[0],
        unit: 'pc',
        cost: '0',
        average_cost: '',
        srp: '0',
        sack_weight_kg: '0',
        price_per_kg: '0',
        labor_cost: '0',
        packaging_cost: '0',
        stock_qty: '0',
        is_vat_exempt: false,
        reorder_point: '10',
        photo_path: '',
        is_hidden: false
    };
}

function blankCustomerForm() {
    return {
        id: '',
        name: '',
        address: '',
        address_2: '',
        contact_number: '',
        customer_username: '',
        tin: ''
    };
}

function blankSupplierForm() {
    return {
        id: '',
        name: '',
        address: '',
        contact_number: '',
        tin: '',
        email: '',
        category: '',
        notes: ''
    };
}

function blankPurchaseForm() {
    return {
        id: '',
        company_name: companyNames[0],
        date: toDateInputValue(),
        supplier_tin: '',
        supplier_name: '',
        receipt_number: '',
        address: '',
        supplier_contact: '',
        supplier_category: '',
        gross_amount: '0',
        is_vat_exempt: false,
        expense_category: 'Materials & Supplies',
        remarks: '',
        items: [blankPurchaseItem()]
    };
}

function blankPurchaseItem() {
    return {
        product_id: '',
        product_code: '',
        product_name: '',
        description: '',
        quantity: '1',
        unit: 'pc',
        unit_cost: '0',
        srp: '0',
        gross_amount: '0',
        is_new_product: false,
        sack_weight_kg: '',
        price_per_kg: '',
        photo_path: ''
    };
}

function blankSaleLine(product = null) {
    const unit = product?.unit ?? 'pc';
    return {
        key: createLocalId('sale-line'),
        product_id: product?.id ?? '',
        qty: '1',
        unit_price: product ? String(product.srp ?? '0') : '',
        unit: unit,
        unit_cost: product ? String(getProductUnitCost(product, unit)) : '0',
        is_vat_exempt: product ? Boolean(product.isVatExempt) : false
    };
}

function blankSaleForm(customerId = '') {
    return {
        id: '',
        company_name: companyNames[0],
        date: toDateInputValue(),
        si_number: '',
        customer_id: customerId,
        channel: salesChannels[1] ?? 'Walk-In',
        status: 'PAID',
        po_number: '',
        invoice_type: 'SI',
        remarks: '',
        items: [blankSaleLine()]
    };
}

function saleToForm(sale) {
    return {
        id: sale.id,
        company_name: sale.companyName ?? companyNames[0],
        date: sale.date ?? toDateInputValue(),
        si_number: sale.siNumber ?? '',
        customer_id: sale.customerId ?? '',
        channel: sale.channel ?? salesChannels[1],
        status: sale.status ?? 'PAID',
        po_number: sale.poNumber ?? '',
        invoice_type: sale.invoiceType ?? 'SI',
        remarks: sale.remarks ?? '',
        items: Array.isArray(sale.items) && sale.items.length > 0
            ? sale.items.map((item) => ({
                key: createLocalId('sale-line'),
                product_id: item.productId ?? '',
                qty: String(item.qty ?? '1'),
                unit_price: String(item.unitPrice ?? '0'),
                unit_cost: String(item.costing ?? '0'),
                unit: item.unit ?? 'pc',
                is_vat_exempt: Boolean(item.isVatExempt)
            }))
            : [blankSaleLine()]
    };
}

function productToForm(product) {
    return {
        id: product.id,
        code: product.code ?? '',
        name: product.name ?? '',
        description: product.description ?? '',
        category: product.category ?? productCategories[0],
        unit: product.unit ?? 'pc',
        cost: String(product.cost ?? 0),
        average_cost: String(calculateAverageCost(product.cost ?? 0, product.laborCost ?? 0, product.packagingCost ?? 0)),
        srp: String(product.srp ?? 0),
        sack_weight_kg: String(product.sackWeightKg ?? 0),
        price_per_kg: String(product.pricePerKg ?? 0),
        labor_cost: String(product.laborCost ?? 0),
        packaging_cost: String(product.packagingCost ?? 0),
        stock_qty: String(product.stockQty ?? 0),
        is_vat_exempt: Boolean(product.isVatExempt),
        reorder_point: String(product.reorderPoint ?? 10),
        photo_path: product.photoPath ?? '',
        is_hidden: Boolean(product.isHidden)
    };
}

function normalizeUnit(value) {
    return String(value ?? '').trim().toLowerCase();
}

function isKilogramUnit(value) {
    return ['kg', 'klg', 'kilo', 'kilogram', 'kilograms'].includes(normalizeUnit(value));
}

function getProductSaleUnitOptions(product) {
    if (!product) {
        return ['pc'];
    }

    const units = [product.unit || 'pc'];
    if ((product.sackWeightKg ?? 0) > 0 || (product.pricePerKg ?? 0) > 0) {
        units.push('kg');
    }

    return Array.from(new Set(units.filter(Boolean)));
}

function getProductUnitPrice(product, unit, qty = 1) {
    if (!product) {
        return 0;
    }

    const isKgSale = isKilogramUnit(unit);
    let requestedStockOut = isKgSale && (product.sackWeightKg ?? 0) > 0 ? qty / product.sackWeightKg : qty;

    if (product.batches && product.batches.length > 0 && requestedStockOut > 0) {
        let totalSrp = 0;
        let remainingToFulfill = requestedStockOut;
        for (const batch of product.batches) {
            const batchQty = toNumber(batch.remaining_qty || batch.remainingQty);
            const batchSrp = toNumber(batch.srp);
            if (batchQty > 0) {
                const consumed = Math.min(batchQty, remainingToFulfill);
                totalSrp += consumed * batchSrp;
                remainingToFulfill -= consumed;
                if (remainingToFulfill <= 0) break;
            }
        }

        const actualFulfilled = requestedStockOut - remainingToFulfill;
        if (actualFulfilled > 0) {
            const weightedBaseSrp = totalSrp / actualFulfilled;
            if (isKgSale && (product.sackWeightKg ?? 0) > 0) {
                return weightedBaseSrp / product.sackWeightKg;
            }
            return weightedBaseSrp;
        }
    }

    if (isKilogramUnit(unit)) {
        if ((product.pricePerKg ?? 0) > 0) {
            return product.pricePerKg;
        }

        if ((product.sackWeightKg ?? 0) > 0) {
            return (product.srp ?? 0) / product.sackWeightKg;
        }
    }

    return product.srp ?? 0;
}

function getProductUnitCost(product, unit, qty = 1) {
    if (!product) {
        return 0;
    }

    const isKgSale = isKilogramUnit(unit);
    let requestedStockOut = isKgSale && (product.sackWeightKg ?? 0) > 0 ? qty / product.sackWeightKg : qty;

    if (product.batches && product.batches.length > 0 && requestedStockOut > 0) {
        let totalCost = 0;
        let remainingToFulfill = requestedStockOut;
        for (const batch of product.batches) {
            const batchQty = toNumber(batch.remaining_qty || batch.remainingQty);
            const batchCost = toNumber(batch.unit_cost || batch.unitCost);
            if (batchQty > 0) {
                const consumed = Math.min(batchQty, remainingToFulfill);
                totalCost += consumed * batchCost;
                remainingToFulfill -= consumed;
                if (remainingToFulfill <= 0) break;
            }
        }

        const actualFulfilled = requestedStockOut - remainingToFulfill;
        if (actualFulfilled > 0) {
            const weightedBaseCost = totalCost / actualFulfilled;
            if (isKgSale && (product.sackWeightKg ?? 0) > 0) {
                return weightedBaseCost / product.sackWeightKg;
            }
            return weightedBaseCost;
        }
    }

    const sackCost = product.averageCost ?? (product.cost ?? 0) + (product.laborCost ?? 0);

    if (isKilogramUnit(unit) && (product.sackWeightKg ?? 0) > 0) {
        return sackCost / product.sackWeightKg;
    }

    return sackCost;
}

function getStockDeduction(product, qty, unit) {
    const safeQty = toNumber(qty);

    if (isKilogramUnit(unit) && (product?.sackWeightKg ?? 0) > 0) {
        return safeQty / product.sackWeightKg;
    }

    return safeQty;
}

function customerToForm(customer) {
    return {
        id: customer.id,
        name: customer.name ?? '',
        address: customer.address ?? '',
        contact_number: customer.contactNumber ?? '',
        customer_username: customer.customerUsername ?? '',
        tin: customer.tin ?? ''
    };
}

function supplierToForm(supplier) {
    return {
        id: supplier.id,
        name: supplier.name ?? '',
        address: supplier.address ?? '',
        contact_number: supplier.contactNumber ?? '',
        tin: supplier.tin ?? '',
        email: supplier.email ?? '',
        category: supplier.category ?? '',
        notes: supplier.notes ?? ''
    };
}

function purchaseToForm(purchase) {
    return {
        id: purchase.id,
        company_name: purchase.companyName ?? companyNames[0],
        date: purchase.date ?? toDateInputValue(),
        supplier_tin: purchase.supplierTin ?? '',
        supplier_name: purchase.supplierName ?? '',
        receipt_number: purchase.receiptNumber ?? '',
        address: purchase.address ?? '',
        gross_amount: String(purchase.grossAmount ?? 0),
        is_vat_exempt: Boolean(purchase.isVatExempt),
        expense_category: purchase.expenseCategory ?? expenseCategories.at(-1),
        remarks: purchase.remarks ?? '',
        items: Array.isArray(purchase.items) && purchase.items.length > 0
            ? purchase.items.map(item => ({
                product_id: item.productId ?? item.product_id ?? '',
                product_code: item.productCode ?? item.product_code ?? '',
                product_name: item.productName ?? item.product_name ?? '',
                quantity: String(item.qty ?? item.quantity ?? 0),
                unit: item.unit ?? 'pc',
                unit_cost: String(item.unitCost ?? item.unit_cost ?? 0),
                srp: String(item.srp ?? 0),
                gross_amount: String(item.grossAmount ?? item.gross_amount ?? 0),
                is_new_product: false
            }))
            : [blankPurchaseItem()]
    };
}

function saleLabel(status) {
    return status === 'FAILED' ? 'FAILED DELIVERY' : status;
}

function statusTone(status) {
    const s = String(status || '').trim().toUpperCase();
    if (s === 'PAID') return 'success';
    if (s === 'A/R' || s === 'PENDING') return 'warning';
    if (s === 'FAILED') return 'danger';
    return 'neutral';
}

function channelTone(channel) {
    const c = String(channel || '').trim().toLowerCase();
    if (c.includes('shopee')) return 'info';
    if (c.includes('walk-in') || c.includes('walk in') || c.includes('walk inn')) return 'success';
    if (c.includes('lalamove') || c.includes('2go')) return 'warning';
    return null;
}

function getHashStyle(text, s = 55, l = 45) {
    const t = String(text || '').trim();
    if (!t) return { className: 'tone-neutral' };

    let hash = 0;
    for (let i = 0; i < t.length; i++) {
        hash = t.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return {
        style: {
            background: `linear-gradient(90deg, hsl(${hue}, ${s}%, ${l}%), hsl(${hue}, ${s}%, ${l + 20}%))`
        }
    };
}

function getChannelStyle(channel) {
    const tone = channelTone(channel);
    if (tone) return { className: `tone-${tone}` };
    return getHashStyle(channel);
}

function summarizeSalePreview(items, products, status, vatRate = defaultTaxSettings.vatRate, originalItems = []) {
    const summary = {
        grossAmount: 0,
        inputVat: 0,
        outputVat: 0,
        vatExemptAmount: 0,
        totalCost: 0,
        profit: 0,
        lines: []
    };

    for (const item of (items || [])) {
        const product = (products || []).find((entry) => String(entry?.id) === String(item?.product_id));

        if (!product) {
            summary.lines.push({
                isOverStock: false,
                availableStock: 0,
                unit: item?.unit || 'pc',
                grossAmount: 0,
                outputVat: 0,
                profit: 0,
                totalCost: 0,
                vatExemptAmount: 0,
                qty: 0,
                unitPrice: 0
            });
            continue;
        }

        const lineUnit = item.unit || product.unit || 'pc';
        const qty = status === 'FAILED' ? 0 : toNumber(item.qty, 1);
        const unitPrice = status === 'FAILED' ? 0 : toNumber(item.unit_price, getProductUnitPrice(product, lineUnit, qty));
        const unitCost = toNumber(item.unit_cost, getProductUnitCost(product, lineUnit, qty));
        const shippingFee = toNumber(item.shipping_fee, 0);
        const line = calculateSaleLine({
            qty,
            unitPrice,
            shippingFee,
            unitCost,
            isVatExempt: item.is_vat_exempt ?? product.is_vat_exempt ?? product.isVatExempt,
            status,
            vatRate,
            grossOverride: item.gross_override
        });

        const stockDeduction = getStockDeduction(product, qty, lineUnit);

        // Account for original items if editing (matching by ID or name for robustness)
        const originalItem = (originalItems || []).find(oi =>
            (oi.productId && String(oi.productId) === String(product.id)) ||
            (oi.name && oi.name === product.name)
        );
        const originalDeduction = originalItem ? getStockDeduction(product, originalItem.qty, originalItem.unit) : 0;

        const availableStock = toNumber(product.stockQty ?? 0) + originalDeduction;
        const isOverStock = stockDeduction > availableStock;

        summary.grossAmount += (line.grossAmount || 0);
        summary.inputVat += (line.inputVat || 0);
        summary.outputVat += (line.outputVat || 0);
        summary.vatExemptAmount += (line.vatExemptAmount || 0);
        summary.totalCost += (line.totalCost || 0);
        summary.profit += (line.profit || 0);
        summary.lines.push({
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            photoPath: product.photoPath ?? '',
            unit: lineUnit,
            stockQtyOut: stockDeduction,
            availableStock,
            isOverStock,
            currentBatchStock: product.currentBatchStock ?? product.stockQty,
            ...line
        });
    }

    return summary;
}

function summarizePurchasePreview(form, vatRate = defaultTaxSettings.vatRate) {
    const isVatExempt = Boolean(form.is_vat_exempt);
    const isMaterials = form.expense_category === 'Materials & Supplies';

    let totalGross;
    if (isMaterials) {
        const items = Array.isArray(form.items) ? form.items : [];
        totalGross = items.reduce((sum, item) => sum + toNumber(item.gross_amount), 0);
    } else {
        totalGross = toNumber(form.gross_amount);
    }

    return calculatePurchaseLine({ grossAmount: totalGross, isVatExempt, vatRate });
}

function purchaseInventoryAmount(item = {}) {
    return roundMoney(toNumber(item.quantity) * toNumber(item.unit_cost));
}

function makeProductCodeFromPurchase(form = {}) {
    const item = form.inventory_item ?? {};
    const source = item.product_name || form.receipt_number || 'PRODUCT';
    const slug = String(source)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);
    const suffix = String(form.receipt_number || Date.now())
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(-6);

    return [slug || 'PRODUCT', suffix].filter(Boolean).join('-');
}

function Toast({ id, text, tone = 'info', onRemove, onClick }) {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(id), 5000);
        return () => clearTimeout(timer);
    }, [id, onRemove]);

    return (
        <div
            className={`toast-item tone-${tone}`}
            onClick={() => {
                if (onClick) onClick();
                onRemove(id);
            }}
            style={onClick ? { cursor: 'pointer' } : undefined}
        >
            <div className="toast-content">
                {tone === 'danger' && <span className="toast-icon">⚠</span>}
                {tone === 'success' && <span className="toast-icon">✓</span>}
                {tone === 'info' && <span className="toast-icon">ℹ</span>}
                <span className="toast-text">{text}</span>
            </div>
            <button className="toast-close">✕</button>
        </div>
    );
}

function ToastContainer({ toasts, onRemove }) {
    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <Toast key={toast.id} {...toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

function MetricCard({ label, value, caption, tone = 'neutral' }) {
    return (
        <article className={`stat-card tone-${tone}`}>
            <span className="stat-label">{label}</span>
            <strong className="stat-value">{value}</strong>
            {caption ? <span className="stat-caption">{caption}</span> : null}
        </article>
    );
}

function Panel({ title, subtitle, actions, children, className = '' }) {
    return (
        <section className={`panel ${className}`.trim()}>
            <div className="panel-head">
                <div>
                    <h2 className="panel-title">{title}</h2>
                    {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
                </div>
                {actions ? <div className="panel-actions">{actions}</div> : null}
            </div>
            {children}
        </section>
    );
}

function Pill({ tone = 'neutral', channel = null, children }) {
    const dynamic = channel ? getChannelStyle(channel) : null;
    const className = dynamic?.className || `tone-${tone}`;
    const style = dynamic?.style || {};

    return (
        <span className={`pill ${className}`} style={style}>
            {children}
        </span>
    );
}

function EmptyState({ title, description }) {
    return (
        <div className="empty-state">
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
        </div>
    );
}

function DashboardTab({ dashboard, meta, filters, onFilterChange, onReorderProduct }) {
    if (!dashboard) {
        return (
            <Panel
                title="Workspace is loading"
                subtitle="Fetching the latest local data from SQLite."
            >
                <EmptyState
                    title="Syncing local records"
                    description="Once the initial load finishes, the dashboard will show sales, stock, and expenses."
                />
            </Panel>
        );
    }

    const maxChannelRevenue = Math.max(...dashboard.channelBreakdown.map((entry) => entry.revenue), 1);
    const maxExpenseAmount = Math.max(...dashboard.expenseBreakdown.map((entry) => entry.amount), 1);

    const dateRangeLabel = `${formatDateShort(dashboard.monthStart)} – ${formatDateShort(dashboard.monthEnd)}`;
    const dateIndicator = (
        <Pill tone="neutral">
            <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8 }}>{dateRangeLabel}</span>
        </Pill>
    );

    return (
        <div className="stack">
            <div className="filter-bar" style={{ marginBottom: '1.5rem' }}>
                <div className="header-title-group" style={{ marginRight: 'auto' }}>
                    <h2 className="panel-title" style={{ fontSize: '1.1rem' }}>Data Period</h2>
                </div>
                <label className="field-compact" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>From</span>
                    <input
                        className="input input-compact"
                        type="date"
                        value={filters.fromDate}
                        onChange={(e) => onFilterChange({ ...filters, fromDate: e.target.value })}
                    />
                </label>
                <label className="field-compact" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>To</span>
                    <input
                        className="input input-compact"
                        type="date"
                        value={filters.toDate}
                        onChange={(e) => onFilterChange({ ...filters, toDate: e.target.value })}
                    />
                </label>
                <button
                    className="button ghost"
                    onClick={() => onFilterChange({ fromDate: '', toDate: '' })}
                    title="Reset to current month"
                >
                    Reset
                </button>
            </div>

            <div className="stat-grid">
                <MetricCard
                    label="Sales today"
                    value={formatCurrency(dashboard.salesToday)}
                    caption={`As of ${formatDateShort(dashboard.today)}`}
                    tone="success"
                />
                <MetricCard
                    label="Sales in period"
                    value={formatCurrency(dashboard.salesMonth)}
                    caption={`From ${formatDateShort(dashboard.monthStart)}`}
                    tone="primary"
                />
                <MetricCard
                    label="Profit in period"
                    value={formatCurrency(dashboard.profitMonth)}
                    caption="After product cost"
                    tone="accent"
                />
                <MetricCard
                    label="Expense total"
                    value={formatCurrency(dashboard.expenseMonth)}
                    caption="In selected period"
                    tone="warning"
                />
                <MetricCard
                    label="Inventory value"
                    value={formatCurrency(dashboard.inventoryValue)}
                    caption={`${formatQuantity(dashboard.unitsOnHand)} total units`}
                    tone="neutral"
                />
                <MetricCard
                    label="Low stock items"
                    value={String(dashboard.lowStockCount)}
                    caption="At or below reorder point"
                    tone="danger"
                />
            </div>

            <div className="dashboard-grid">
                <Panel
                    title="Sales by channel"
                    subtitle="Revenue mix across customer touchpoints"
                    actions={dateIndicator}
                >
                    {dashboard.channelBreakdown.length === 0 ? (
                        <EmptyState title="No channel data yet" description="Sales will appear here after the first entries are saved." />
                    ) : (
                        <div className="mini-bars">
                            {dashboard.channelBreakdown.map((entry) => (
                                <div key={entry.channel} className="bar-row">
                                    <div className="bar-row-head">
                                        <span>{entry.channel}</span>
                                        <span>{formatCurrency(entry.revenue)}</span>
                                    </div>
                                    <div className="bar-track">
                                        <div
                                            className={`bar-fill ${getChannelStyle(entry.channel).className || ''}`}
                                            style={{
                                                width: `${Math.max((entry.revenue / maxChannelRevenue) * 100, 2)}%`,
                                                animation: `bar-grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                                                transformOrigin: 'left',
                                                ...(getChannelStyle(entry.channel).style || {})
                                            }}
                                        />
                                    </div>
                                    <div className="bar-caption">{entry.saleCount} sales</div>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Top 5 products" subtitle="Highest revenue performers in period" actions={dateIndicator}>
                    {dashboard.topProducts.length === 0 ? (
                        <EmptyState title="Nothing sold yet" description="Product rankings will populate after sales are recorded." />
                    ) : (
                        <div className="mini-list">
                            {dashboard.topProducts.map((product) => (
                                <div key={product.id} className="mini-list-row">
                                    <div>
                                        <strong>{product.name}</strong>
                                        <span>{product.code}</span>
                                    </div>
                                    <div className="mini-list-metrics">
                                        <strong>{formatCurrency(product.revenue)}</strong>
                                        <span>
                                            {formatQuantity(product.qtySold)} {product.unit}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            <div className="dashboard-grid">
                <Panel title="Low stock alerts" subtitle="Products near or below reorder point">
                    {dashboard.lowStockProducts.length === 0 ? (
                        <EmptyState title="Stock looks healthy" description="No items are below the configured reorder point right now." />
                    ) : (
                        <div className="mini-list" style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                            {dashboard.lowStockProducts.map((product) => (
                                <div key={product.id} className="mini-list-row">
                                    <div>
                                        <strong>{product.name}</strong>
                                        <span>
                                            {product.code} | reorder {formatQuantity(product.reorderPoint)}
                                        </span>
                                    </div>
                                    <div className="mini-list-metrics" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Pill tone="danger">{formatQuantity(product.stockQty)} ({product.unit}) in stock</Pill>
                                        <button
                                            className="button primary compact"
                                            onClick={() => onReorderProduct(product)}
                                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                        >
                                            Reorder
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Recent sales" subtitle="Latest confirmed and pending transactions">
                    {dashboard.recentSales.length === 0 ? (
                        <EmptyState title="No sales yet" description="Once the team records a sale, the latest entries will show up here." />
                    ) : (
                        <div className="table-wrap compact">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Customer</th>
                                        <th>Status</th>
                                        <th className="numeric">Gross</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.recentSales.map((sale) => (
                                        <tr key={sale.id}>
                                            <td>{formatDateShort(sale.date)}</td>
                                            <td>{sale.customerName || 'Walk-in'}</td>
                                            <td>
                                                <Pill tone={statusTone(sale.status)}>{saleLabel(sale.status)}</Pill>
                                            </td>
                                            <td className="numeric">{formatCurrency(sale.grossAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            </div>

            <div className="dashboard-grid">
                <Panel
                    title="Expense breakdown"
                    subtitle="Current month purchases and operational spend"
                    actions={dateIndicator}
                >
                    {dashboard.expenseBreakdown.length === 0 ? (
                        <EmptyState title="No expenses yet" description="Purchases and expenses will appear once entries are recorded." />
                    ) : (
                        <div className="mini-bars">
                            {dashboard.expenseBreakdown.map((entry) => (
                                <div key={entry.category} className="bar-row">
                                    <div className="bar-row-head">
                                        <span>{entry.category}</span>
                                        <span>{formatCurrency(entry.amount)}</span>
                                    </div>
                                    <div className="bar-track">
                                        <div
                                            className="bar-fill"
                                            style={{
                                                width: `${Math.max((entry.amount / maxExpenseAmount) * 100, 2)}%`,
                                                animation: `bar-grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                                                transformOrigin: 'left',
                                                ...getHashStyle(entry.category, 65, 45).style
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Recent purchases" subtitle="Latest expense entries">
                    {dashboard.recentPurchases.length === 0 ? (
                        <EmptyState title="No purchases yet" description="Expense entries will show up here after the first save." />
                    ) : (
                        <div className="table-wrap compact">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Supplier</th>
                                        <th>Category</th>
                                        <th className="numeric">Gross</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.recentPurchases.map((purchase) => (
                                        <tr key={purchase.id}>
                                            <td>{formatDateShort(purchase.date)}</td>
                                            <td>{purchase.supplierName}</td>
                                            <td>{purchase.expenseCategory}</td>
                                            <td className="numeric">{formatCurrency(purchase.grossAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            </div>

            <div className="dashboard-grid">
                <Panel
                    title="Accounts Receivable (A/R)"
                    subtitle={`${dashboard.arCount} outstanding transaction${dashboard.arCount !== 1 ? 's' : ''}`}
                >
                    <div style={{ marginBottom: '16px' }}>
                        <MetricCard
                            label="Total A/R Outstanding"
                            value={formatCurrency(dashboard.arTotal)}
                            caption={`${dashboard.arCount} unpaid sale${dashboard.arCount !== 1 ? 's' : ''}`}
                            tone={dashboard.arTotal > 0 ? 'danger' : 'success'}
                        />
                    </div>
                    {dashboard.arSales.length === 0 ? (
                        <EmptyState title="No receivables" description="All sales are fully paid. Great job!" />
                    ) : (
                        <div className="table-wrap compact" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Customer</th>
                                        <th>Receipt #</th>
                                        <th className="numeric">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.arSales.map((sale) => (
                                        <tr key={sale.id}>
                                            <td>{formatDateShort(sale.date)}</td>
                                            <td>{sale.customerName || 'Walk-in'}</td>
                                            <td>{sale.receiptNumber ? String(sale.receiptNumber).padStart(5, '0') : '-'}</td>
                                            <td className="numeric">{formatCurrency(sale.grossAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-strong)' }}>
                                        <td colSpan="3">Total</td>
                                        <td className="numeric">{formatCurrency(dashboard.arTotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </Panel>
            </div>

            <Panel
                title="Financial summary"
                subtitle={`App version ${meta?.version ?? '0.5.0'} | VAT and stock snapshots are built from the live local data.`}
                actions={dateIndicator}
            >
                <div className="summary-grid">
                    <MetricCard
                        label="Output VAT"
                        value={formatCurrency(dashboard.outputVatMonth)}
                        caption="Collected from sales"
                        tone="primary"
                    />
                    <MetricCard
                        label="Input VAT"
                        value={formatCurrency(dashboard.inputVatMonth)}
                        caption="Estimated from expenses"
                        tone="warning"
                    />
                    <MetricCard
                        label="VAT-exempt sales"
                        value={formatCurrency(dashboard.vatExemptSales)}
                        caption="No VAT applied"
                        tone="accent"
                    />
                </div>
            </Panel>
        </div>
    );
}


function MoreActionsMenu({ actions = [] }) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    if (!actions || actions.length === 0) return null;

    return (
        <div className="more-actions" ref={menuRef}>
            <button
                className="dots-button"
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                title="More actions"
            >
                ⋮
            </button>
            {isOpen && (
                <div className="dropdown-menu">
                    {actions.map((action, idx) => (
                        <button
                            key={idx}
                            className={`dropdown-item ${action.tone || ''}`}
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                action.onClick();
                            }}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function Pagination({ currentPage, totalItems, pageSize, onPageChange, onPageSizeChange }) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);

    if (totalItems === 0) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 4px 4px',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '0.85rem',
            color: 'var(--muted)'
        }}>
            <span style={{ whiteSpace: 'nowrap' }}>
                {start}–{end} of {totalItems}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                    className="button secondary icon-button-compact"
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    title="Previous page"
                >
                    ←
                </button>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--fg)' }}>
                    Page {currentPage} / {totalPages}
                </span>
                <button
                    className="button secondary icon-button-compact"
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                    title="Next page"
                >
                    →
                </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ whiteSpace: 'nowrap' }}>Rows:</span>
                <select
                    className="select select-compact"
                    style={{ width: 'auto' }}
                    value={pageSize}
                    onChange={(e) => {
                        onPageSizeChange(Number(e.target.value));
                        onPageChange(1);
                    }}
                >
                    {[25, 50, 100, 250, 500].map((size) => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}

function ProductsTab({
    products,
    search,
    setSearch,
    onEdit,
    onDelete,
    onBulkDelete,
    onBulkToggleVisibility,
    onCreateNew,
    onSplit,
    onReorderProduct,
    onExport,
    onImport
}) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [activeProductId, setActiveProductId] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [retailFilter, setRetailFilter] = useState('all');
    const [activeCustomerId, setActiveCustomerId] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [showHidden, setShowHidden] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const gridRef = useRef(null);

    const allCategories = Array.from(new Set([...productCategories, ...products.map(p => (p.category || '').trim())])).sort().filter(Boolean);

    useEffect(() => {
        function handleClickOutside(event) {
            if (activeProductId && !event.target.closest('.product-card')) {
                setActiveProductId(null);
            }
        }
        if (activeProductId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeProductId]);

    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            if (!showHidden && product.isHidden) return false;
            const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
            const matchesRetail = retailFilter === 'all' || (retailFilter === 'retail' ? product.isRetail : !product.isRetail);
            const query = search.trim().toLowerCase();
            const matchesSearch = !query || [product.code, product.name, product.category, product.description]
                .join(' ')
                .toLowerCase()
                .includes(query);
            return matchesCategory && matchesRetail && matchesSearch;
        });
    }, [products, categoryFilter, retailFilter, search, showHidden]);

    const sortedProducts = useMemo(() => {
        return [...filteredProducts].sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (['stockQty', 'averageCost', 'srp'].includes(sortConfig.key)) {
                return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }

            aValue = (aValue || '').toString().toLowerCase();
            bValue = (bValue || '').toString().toLowerCase();

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredProducts, sortConfig]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, pageSize, categoryFilter, retailFilter, showHidden]);

    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedProducts.slice(start, start + pageSize);
    }, [sortedProducts, currentPage, pageSize]);

    return (
        <div className="stack">
            <Panel
                title="Product catalog"
                subtitle={`${filteredProducts.length} of ${products.length} products shown`}
                actions={
                    <>
                        <div className="stack-h" style={{ gap: '8px' }}>
                            <button className="button primary" type="button" onClick={onCreateNew}>
                                Add product
                            </button>
                            <div style={{ width: '1px', height: '24px', background: '#eee', margin: '0 4px' }} />
                            <select
                                className="select select-compact"
                                style={{ width: 'auto', minWidth: '130px' }}
                                value={sortConfig.key}
                                onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
                            >
                                <option value="name">Sort by Name</option>
                                <option value="stockQty">Sort by Stock</option>
                                <option value="averageCost">Sort by Cost</option>
                                <option value="srp">Sort by SRP</option>
                                <option value="category">Sort by Category</option>
                                <option value="code">Sort by Code</option>
                            </select>
                            <button
                                className="button secondary icon-button-compact"
                                type="button"
                                onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                                title={sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}
                            >
                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </button>
                        </div>
                        <select
                            className="select select-compact"
                            style={{ width: 'auto', minWidth: '130px' }}
                            value={retailFilter}
                            onChange={(e) => setRetailFilter(e.target.value)}
                        >
                            <option value="all">All Types</option>
                            <option value="retail">Retail Only</option>
                            <option value="not_retail">Bulk / Sacks</option>
                        </select>
                        <select
                            className="select select-compact"
                            style={{ width: 'auto', minWidth: '140px' }}
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="all">All Categories</option>
                            {allCategories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <label className="select-all-wrap" style={{ borderRight: 'none', marginRight: 0, height: '36px' }}>
                            <input
                                type="checkbox"
                                checked={showHidden}
                                onChange={(e) => setShowHidden(e.target.checked)}
                            />
                            <span>Show Hidden</span>
                        </label>
                        <input
                            className="input input-compact"
                            placeholder="Search products..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        {selectedIds.length > 0 && (
                            <div className="stack-h" style={{ gap: '12px', marginLeft: 'auto' }}>
                                <label className="select-all-wrap" style={{ borderRight: 'none', marginRight: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedIds(filteredProducts.map(p => p.id));
                                            } else {
                                                setSelectedIds([]);
                                            }
                                        }}
                                    />
                                    <span>Select all</span>
                                </label>
                                <button
                                    className="button secondary"
                                    type="button"
                                    onClick={() => {
                                        onBulkToggleVisibility(selectedIds, true);
                                        setSelectedIds([]);
                                    }}
                                >
                                    Hide ({selectedIds.length})
                                </button>
                                <button
                                    className="button secondary"
                                    type="button"
                                    onClick={() => {
                                        onBulkToggleVisibility(selectedIds, false);
                                        setSelectedIds([]);
                                    }}
                                >
                                    Unhide ({selectedIds.length})
                                </button>
                                <button
                                    className="button danger"
                                    type="button"
                                    onClick={() => {
                                        onBulkDelete(selectedIds);
                                        setSelectedIds([]);
                                    }}
                                >
                                    Delete Selected ({selectedIds.length})
                                </button>
                            </div>
                        )}

                    </>
                }
            >
                {filteredProducts.length === 0 ? (
                    <EmptyState title="No products found" description="Try a different search term or add the first catalog item." />
                ) : (
                    <div className="product-grid" ref={gridRef}>
                        {paginatedProducts.map((product) => (
                            <article
                                key={product.id}
                                className={`product-card ${activeProductId === product.id ? 'active' : ''}`}
                                onClick={() => setActiveProductId(product.id === activeProductId ? null : product.id)}
                            >
                                {product.isRetail && <div className="retail-badge">Retail</div>}
                                <input
                                    type="checkbox"
                                    className="card-checkbox"
                                    checked={selectedIds.includes(product.id)}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        if (e.target.checked) {
                                            setSelectedIds([...selectedIds, product.id]);
                                        } else {
                                            setSelectedIds(selectedIds.filter((id) => id !== product.id));
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <div className="product-card-media">
                                    {product.photoPath ? (
                                        <img
                                            className="product-card-image"
                                            src={window.agriLedger.sync.resolvePhotoUrl(product.photoPath)}
                                            alt={product.name}
                                        />
                                    ) : (
                                        <div className="product-card-placeholder">No photo</div>
                                    )}
                                </div>
                                <div className="product-card-content">
                                    <strong>{product.name || 'Unnamed'}</strong>
                                    <div className="product-card-meta">
                                        <span>{formatCurrency(product.srp)} SRP</span>
                                        <div className="stack" style={{ gap: '2px', alignItems: 'flex-end' }}>
                                            <span style={{ fontWeight: 600, color: product.stockQty <= (product.reorderPoint ?? 10) ? 'var(--danger)' : 'inherit' }}>{formatQuantity(product.stockQty)} ({product.unit}) in stock</span>
                                            {product.currentBatchStock < product.stockQty && (
                                                <span className="pill tone-warning" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                                    {formatQuantity(product.currentBatchStock)} ({product.unit}) old stock
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="product-card-meta" style={{ marginTop: '4px', fontSize: '0.8rem', color: '#666' }}>
                                        <span>Cost: {formatCurrency(product.averageCost)}</span>
                                    </div>
                                    {activeProductId === product.id && (
                                        <div className="product-card-overlay-actions" style={{ marginTop: '12px', flexDirection: 'row', maxWidth: 'none', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                                            <button

                                                className="btn-card-split"
                                                type="button"
                                                style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#2980b9', borderColor: 'rgba(52, 152, 219, 0.2)' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onReorderProduct(product);
                                                    setActiveProductId(null);
                                                }}
                                            >
                                                Reorder
                                            </button>
                                            {product.sackWeightKg > 0 && (
                                                <button
                                                    className="btn-card-split"
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSplit(product);
                                                        setActiveProductId(null);
                                                    }}
                                                >
                                                    Split
                                                </button>
                                            )}
                                            <button
                                                className="btn-card-edit"
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEdit(product);
                                                    setActiveProductId(null);
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="btn-card-delete"
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(product.id);
                                                    setActiveProductId(null);
                                                }}
                                            >
                                                Del
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredProducts.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </Panel>
        </div>
    );
}

function CustomersTab({
    customers,
    search,
    setSearch,
    showForm,
    form,
    setForm,
    onSubmit,
    onCreateNew,
    onEdit,
    onDelete,
    onBulkDelete,
    onCancel,
    onExport,
    onImport
}) {
    const customerNameInputRef = useRef(null);
    const [activeCustomerId, setActiveCustomerId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    function handleSort(key) {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    }

    useEffect(() => {
        if (customerNameInputRef.current) {
            requestAnimationFrame(() => {
                customerNameInputRef.current?.focus();
            });
        }
    }, [form.id]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (activeCustomerId && !event.target.closest('.table tr')) {
                setActiveCustomerId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeCustomerId]);

    const filteredCustomers = useMemo(() => {
        return customers.filter((customer) => {
            const query = search.trim().toLowerCase();
            if (!query) return true;
            return [customer.name, customer.address, customer.address2, customer.contactNumber, customer.customerUsername, customer.tin]
                .join(' ')
                .toLowerCase()
                .includes(query);
        });
    }, [customers, search]);

    const sortedCustomers = useMemo(() => {
        return [...filteredCustomers].sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            aValue = (aValue || '').toString().toLowerCase();
            bValue = (bValue || '').toString().toLowerCase();

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredCustomers, sortConfig]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, pageSize]);

    const paginatedCustomers = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedCustomers.slice(start, start + pageSize);
    }, [sortedCustomers, currentPage, pageSize]);

    return (
        <div className="stack">

            <div className="filter-bar">
                <div className="stack-h" style={{ gap: '8px' }}>
                    <select
                        className="select select-compact"
                        style={{ width: 'auto', minWidth: '130px' }}
                        value={sortConfig.key}
                        onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
                    >
                        <option value="name">Sort by Name</option>
                        <option value="contactNumber">Sort by Contact</option>
                        <option value="customerUsername">Sort by Username</option>
                        <option value="tin">Sort by TIN</option>
                    </select>
                    <button
                        className="button secondary icon-button-compact"
                        type="button"
                        onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                        title={sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </button>
                </div>

                <button className="button primary" type="button" onClick={onCreateNew}>
                    Add customer
                </button>
                <input
                    className="input input-compact"
                    placeholder="Search customers..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </div>

            <Panel
                title="Customer directory"
                subtitle={`${filteredCustomers.length} of ${customers.length} customers shown`}
                actions={
                    selectedIds.length > 0 && (
                        <button
                            className="button danger"
                            type="button"
                            onClick={() => {
                                onBulkDelete(selectedIds);
                                setSelectedIds([]);
                            }}
                        >
                            Delete Selected ({selectedIds.length})
                        </button>
                    )
                }
            >
                {filteredCustomers.length === 0 ? (
                    <EmptyState title="No customers found" description="Try another search term or create the first customer profile." />
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="table-checkbox-cell">
                                        <input
                                            type="checkbox"
                                            className="table-checkbox"
                                            checked={selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedIds(filteredCustomers.map((c) => c.id));
                                                } else {
                                                    setSelectedIds([]);
                                                }
                                            }}
                                        />
                                    </th>
                                    <th onClick={() => handleSort('name')} className="sortable-header">
                                        <div className="header-sort-content">
                                            Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('contactNumber')} className="sortable-header">
                                        <div className="header-sort-content">
                                            Contact {sortConfig.key === 'contactNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('customerUsername')} className="sortable-header">
                                        <div className="header-sort-content">
                                            Username {sortConfig.key === 'customerUsername' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('tin')} className="sortable-header">
                                        <div className="header-sort-content">
                                            TIN {sortConfig.key === 'tin' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedCustomers.map((customer) => (
                                    <tr
                                        key={customer.id}
                                        className={`${selectedIds.includes(customer.id) ? 'selected-row' : ''} ${activeCustomerId === customer.id ? 'active' : ''}`}
                                        onClick={() => {
                                            if (window.getSelection().toString()) return;
                                            setActiveCustomerId(customer.id === activeCustomerId ? null : customer.id);
                                        }}
                                        style={{ position: 'relative' }}
                                    >
                                        <td className="table-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="table-checkbox"
                                                checked={selectedIds.includes(customer.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedIds([...selectedIds, customer.id]);
                                                    } else {
                                                        setSelectedIds(selectedIds.filter((id) => id !== customer.id));
                                                    }
                                                }}
                                            />
                                        </td>
                                        <td>
                                            <strong>{customer.name}</strong>
                                            <div className="row-note" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>
                                                {customer.address || 'No address'}
                                                {customer.address2 && <><br />{customer.address2}</>}
                                            </div>
                                        </td>
                                        <td>{customer.contactNumber || '-'}</td>
                                        <td>{customer.customerUsername || '-'}</td>
                                        <td>{customer.tin || '-'}</td>

                                        {activeCustomerId === customer.id && (
                                            <td className="row-overlay-cell" onClick={(e) => e.stopPropagation()}>
                                                <div className="row-overlay" onClick={() => setActiveCustomerId(null)}>
                                                    <div className="product-card-overlay-actions" style={{ flexDirection: 'row', maxWidth: 'none' }} onClick={(e) => e.stopPropagation()}>
                                                        <button className="btn-card-edit" type="button" onClick={(e) => { e.stopPropagation(); onEdit(customer); setActiveCustomerId(null); }}>Edit</button>
                                                        <button className="btn-card-delete" type="button" onClick={(e) => { e.stopPropagation(); onDelete(customer.id); setActiveCustomerId(null); }}>Delete</button>
                                                    </div>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredCustomers.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </Panel>
        </div>
    );
}

function SuppliersTab({
    suppliers,
    search,
    setSearch,
    showForm,
    form,
    setForm,
    onSubmit,
    onCreateNew,
    onEdit,
    onDelete,
    onBulkDelete,
    onCancel
}) {
    const supplierNameInputRef = useRef(null);
    const [activeSupplierId, setActiveSupplierId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    function handleSort(key) {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    }

    useEffect(() => {
        if (supplierNameInputRef.current) {
            requestAnimationFrame(() => {
                supplierNameInputRef.current?.focus();
            });
        }
    }, [form.id]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (activeSupplierId && !event.target.closest('.table tr')) {
                setActiveSupplierId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeSupplierId]);

    const filteredSuppliers = useMemo(() => {
        return suppliers.filter((s) => {
            const query = search.trim().toLowerCase();
            if (!query) return true;
            return [s.name, s.address, s.contactNumber, s.tin, s.email, s.category, s.notes]
                .join(' ')
                .toLowerCase()
                .includes(query);
        });
    }, [suppliers, search]);

    const sortedSuppliers = useMemo(() => {
        return [...filteredSuppliers].sort((a, b) => {
            let aValue = (a[sortConfig.key] || '').toString().toLowerCase();
            let bValue = (b[sortConfig.key] || '').toString().toLowerCase();
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredSuppliers, sortConfig]);

    const paginatedSuppliers = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedSuppliers.slice(start, start + pageSize);
    }, [sortedSuppliers, currentPage, pageSize]);

    useEffect(() => { setCurrentPage(1); }, [search, pageSize]);

    return (
        <div className="stack">

            <div className="filter-bar">
                <div className="stack-h" style={{ gap: '8px' }}>
                    <select
                        className="select select-compact"
                        style={{ width: 'auto', minWidth: '130px' }}
                        value={sortConfig.key}
                        onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
                    >
                        <option value="name">Sort by Name</option>
                        <option value="category">Sort by Category</option>
                        <option value="contactNumber">Sort by Contact</option>
                        <option value="tin">Sort by TIN</option>
                    </select>
                    <button
                        className="button secondary icon-button-compact"
                        type="button"
                        onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                        title={sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </button>
                </div>

                <button className="button primary" type="button" onClick={onCreateNew}>
                    Add supplier
                </button>
                <input
                    className="input input-compact"
                    placeholder="Search suppliers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <Panel
                title="Supplier directory"
                subtitle={`${filteredSuppliers.length} of ${suppliers.length} suppliers shown`}
                actions={
                    selectedIds.length > 0 && (
                        <button
                            className="button danger"
                            type="button"
                            onClick={() => {
                                onBulkDelete(selectedIds);
                                setSelectedIds([]);
                            }}
                        >
                            Delete Selected ({selectedIds.length})
                        </button>
                    )
                }
            >
                {filteredSuppliers.length === 0 ? (
                    <EmptyState title="No suppliers found" description="Try another search term or add the first supplier profile." />
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="table-checkbox-cell">
                                        <input
                                            type="checkbox"
                                            className="table-checkbox"
                                            checked={selectedIds.length === filteredSuppliers.length && filteredSuppliers.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedIds(filteredSuppliers.map((s) => s.id));
                                                } else {
                                                    setSelectedIds([]);
                                                }
                                            }}
                                        />
                                    </th>
                                    <th onClick={() => handleSort('name')} className="sortable-header">
                                        <div className="header-sort-content">Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                                    </th>
                                    <th onClick={() => handleSort('address')} className="sortable-header">
                                        <div className="header-sort-content">Address {sortConfig.key === 'address' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                                    </th>
                                    <th onClick={() => handleSort('category')} className="sortable-header">
                                        <div className="header-sort-content">Category {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                                    </th>
                                    <th onClick={() => handleSort('contactNumber')} className="sortable-header">
                                        <div className="header-sort-content">Contact {sortConfig.key === 'contactNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                                    </th>
                                    <th onClick={() => handleSort('tin')} className="sortable-header">
                                        <div className="header-sort-content">TIN {sortConfig.key === 'tin' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                                    </th>
                                    <th onClick={() => handleSort('email')} className="sortable-header">
                                        <div className="header-sort-content">Email {sortConfig.key === 'email' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedSuppliers.map((supplier) => (
                                    <tr
                                        key={supplier.id}
                                        className={`${selectedIds.includes(supplier.id) ? 'selected-row' : ''} ${activeSupplierId === supplier.id ? 'active' : ''}`}
                                        onClick={() => {
                                            if (window.getSelection().toString()) return;
                                            setActiveSupplierId(supplier.id === activeSupplierId ? null : supplier.id);
                                        }}
                                        style={{ position: 'relative' }}
                                    >
                                        <td className="table-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="table-checkbox"
                                                checked={selectedIds.includes(supplier.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedIds([...selectedIds, supplier.id]);
                                                    } else {
                                                        setSelectedIds(selectedIds.filter((id) => id !== supplier.id));
                                                    }
                                                }}
                                            />
                                        </td>
                                        <td>
                                            <strong>{supplier.name}</strong>
                                        </td>
                                        <td>{supplier.address || '-'}</td>
                                        <td>{supplier.category || '-'}</td>
                                        <td>{supplier.contactNumber || '-'}</td>
                                        <td>{supplier.tin || '-'}</td>
                                        <td>{supplier.email || '-'}</td>

                                        {activeSupplierId === supplier.id && (
                                            <td className="row-overlay-cell" onClick={(e) => e.stopPropagation()}>
                                                <div className="row-overlay" onClick={() => setActiveSupplierId(null)}>
                                                    <div className="product-card-overlay-actions" style={{ flexDirection: 'row', maxWidth: 'none' }} onClick={(e) => e.stopPropagation()}>
                                                        <button className="btn-card-edit" type="button" onClick={(e) => { e.stopPropagation(); onEdit(supplier); setActiveSupplierId(null); }}>Edit</button>
                                                        <button className="btn-card-delete" type="button" onClick={(e) => { e.stopPropagation(); onDelete(supplier.id); setActiveSupplierId(null); }}>Delete</button>
                                                    </div>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredSuppliers.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </Panel>
        </div>
    );
}

function SalesTab({
    sales,
    products,
    customers,
    taxSettings,
    filters,
    setFilters,
    showForm,
    form,
    setForm,
    onSubmit,
    onEdit,
    onDelete,
    onBulkDelete,
    onCreateNew,
    onCancel,
    onViewReceipt,
    onExport,
    onImport,
    onUpdateStatus,
    onCreateCustomer,
    onCreateProduct
}) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [activeSaleId, setActiveSaleId] = useState(null);
    const saleDateInputRef = useRef(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterPanelRef = useRef(null);
    const [sortConfig, setSortConfig] = useState({ key: 'receiptNumber', direction: 'desc' });
    const [customChannelInput, setCustomChannelInput] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Build a merged list of all channels: predefined + any custom ones found in existing sales
    const allChannels = useMemo(() => {
        return Array.from(new Set([
            ...salesChannels,
            ...sales.map((s) => (s.channel || '').trim()).filter(Boolean)
        ])).sort();
    }, [sales]);

    function handleSort(key) {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    }

    useEffect(() => {
        if (saleDateInputRef.current) {
            requestAnimationFrame(() => {
                saleDateInputRef.current?.focus();
            });
        }
    }, [form.id]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (filterPanelRef.current && !filterPanelRef.current.contains(event.target)) {
                setFilterOpen(false);
            }
            if (activeSaleId && !event.target.closest('.table tr')) {
                setActiveSaleId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [filterOpen, activeSaleId]);

    const defaultFilters = { search: '', status: 'all', channel: 'all', companyName: 'all', fromDate: '', toDate: '' };

    function clearFilters() {
        setFilters(defaultFilters);
    }

    const activeFilterCount = [
        filters.status !== 'all',
        filters.channel !== 'all',
        filters.companyName !== 'all',
        Boolean(filters.fromDate),
        Boolean(filters.toDate)
    ].filter(Boolean).length;

    const filteredSales = useMemo(() => {
        return sales.filter((sale) => {
            const query = filters.search.trim().toLowerCase();
            const matchesSearch =
                !query ||
                [sale.companyName, sale.siNumber, sale.poNumber, sale.customerName, sale.channel, sale.remarks]
                    .join(' ')
                    .toLowerCase()
                    .includes(query);
            const matchesStatus = filters.status === 'all' || sale.status === filters.status;
            const matchesChannel = filters.channel === 'all' || sale.channel === filters.channel;
            const matchesCompany = filters.companyName === 'all' || sale.companyName === filters.companyName;
            const matchesFrom = !filters.fromDate || sale.date >= filters.fromDate;
            const matchesTo = !filters.toDate || sale.date <= filters.toDate;
            return matchesSearch && matchesStatus && matchesChannel && matchesCompany && matchesFrom && matchesTo;
        });
    }, [sales, filters]);

    const sortedSales = useMemo(() => {
        return [...filteredSales].sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (sortConfig.key === 'productName') {
                aValue = Array.isArray(a.items) && a.items.length > 0
                    ? a.items.map(item => item.name || '').filter(Boolean).join(', ')
                    : '';
                bValue = Array.isArray(b.items) && b.items.length > 0
                    ? b.items.map(item => item.name || '').filter(Boolean).join(', ')
                    : '';
            }

            if (sortConfig.key === 'customerName') {
                aValue = aValue || 'Walk-in';
                bValue = bValue || 'Walk-in';
            }

            if (typeof aValue === 'string' || typeof bValue === 'string') {
                const comparison = String(aValue || '').localeCompare(String(bValue || ''));
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            }

            const numA = Number(aValue) || 0;
            const numB = Number(bValue) || 0;
            return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
        });
    }, [filteredSales, sortConfig]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters, pageSize]);

    const paginatedSales = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedSales.slice(start, start + pageSize);
    }, [sortedSales, currentPage, pageSize]);

    const originalSale = useMemo(() => {
        if (!form.id) return null;
        return sales.find(s => s.id === form.id);
    }, [sales, form.id]);

    const preview = summarizeSalePreview(form.items, products, form.status, taxSettings?.vatRate, originalSale?.items);
    const validItems = (form.items || []).filter((item) => item.product_id);
    const overStockItem = preview.lines.find((line) => line.isOverStock);
    let saveBlockerMessage = '';

    if (!form.date) {
        saveBlockerMessage = 'Sale date is required.';
    } else if (validItems.length === 0) {
        saveBlockerMessage = 'Add at least one product line before saving.';
    } else if (preview.lines.some(l => l.qty <= 0 && form.status !== 'FAILED')) {
        const item = preview.lines.find(l => l.qty <= 0);
        saveBlockerMessage = `Quantity for ${item.productName || 'product'} must be greater than zero.`;
    } else if (overStockItem) {
        saveBlockerMessage = `Insufficient stock for ${overStockItem.productName}. Only ${formatQuantity(overStockItem.availableStock)} ${overStockItem.unit} available.`;
    }

    function updateLine(index, patch) {
        setForm((current) => ({
            ...current,
            items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
        }));
    }

    function addLine() {
        setForm((current) => ({
            ...current,
            items: [...current.items, blankSaleLine()]
        }));
    }

    function removeLine(index) {
        setForm((current) => ({
            ...current,
            items: current.items.length === 1 ? current.items : current.items.filter((_, itemIndex) => itemIndex !== index)
        }));
    }

    function selectProduct(index, productId) {
        const product = products.find((entry) => String(entry.id) === String(productId));
        const unit = product?.unit ?? 'pc';
        updateLine(index, {
            product_id: productId,
            unit,
            unit_price: '',
            unit_cost: '',
            is_vat_exempt: Boolean(product?.isVatExempt)
        });
    }

    function updateLineUnit(index, unit) {
        const currentLine = form.items[index];
        const product = products.find((entry) => String(entry.id) === String(currentLine.product_id));
        const updates = { unit };

        if (getProductSaleUnitOptions(product).includes(unit)) {
            updates.unit_price = '';
            updates.unit_cost = '';
        }

        updateLine(index, updates);
    }

    return (
        <div className="stack">
            {/* ── Modal overlay for add / edit ── */}
            {showForm ? (
                <div className="modal-backdrop">
                    <div className="modal-box modal-wide">
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">{form.id ? 'Edit sale' : 'New sale entry'}</h3>
                                <p className="muted" style={{ margin: '4px 0 0' }}>Record transactions, VAT, and line item profit in one pass.</p>
                            </div>
                            <button className="modal-close" type="button" onClick={onCancel} aria-label="Close">✕</button>
                        </div>

                        <div className="sales-grid">
                            <form className="form-stack" onSubmit={onSubmit}>
                                <div className="field-grid">
                                    <label className="field">
                                        <span>Date <span style={{ color: 'var(--danger)' }}>*</span></span>
                                        <input
                                            ref={saleDateInputRef}
                                            className="input"
                                            type="date"
                                            value={form.date}
                                            onChange={(event) => setForm({ ...form, date: event.target.value })}
                                        />
                                    </label>
                                    <label className="field">
                                        <span>SI number (optional)</span>
                                        <input
                                            className="input"
                                            placeholder="Sales Invoice #"
                                            value={form.si_number}
                                            onChange={(event) => setForm({ ...form, si_number: event.target.value })}
                                        />
                                    </label>
                                    <div className="field">
                                        <span>Customer (optional)</span>
                                        <div className="stack-h" style={{ gap: '6px', alignItems: 'stretch' }}>
                                            <div style={{ flex: 1 }}>
                                                <CustomerSearchSelect
                                                    customers={customers}
                                                    value={form.customer_id}
                                                    onChange={(val) => setForm({ ...form, customer_id: val })}
                                                    onCreateNew={onCreateCustomer}
                                                />
                                            </div>
                                            <button
                                                className="button secondary"
                                                type="button"
                                                title="Create new customer"
                                                style={{ padding: '0 12px', minHeight: '38px', borderRadius: '12px', flexShrink: 0 }}
                                                onClick={() => onCreateCustomer('')}
                                            >
                                                ＋
                                            </button>
                                        </div>
                                    </div>
                                    <label className="field">
                                        <span>Company <span style={{ color: 'var(--danger)' }}>*</span></span>
                                        <select
                                            className="select"
                                            value={form.company_name}
                                            onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                                        >
                                            {companyNames.map((companyName) => (
                                                <option key={companyName} value={companyName}>
                                                    {companyName}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="field">
                                        <span>Channel <span style={{ color: 'var(--danger)' }}>*</span></span>
                                        {customChannelInput ? (
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <input
                                                    className="input"
                                                    placeholder="Type custom channel..."
                                                    value={form.channel}
                                                    autoFocus
                                                    onChange={(event) => setForm({ ...form, channel: event.target.value })}
                                                />
                                                <button
                                                    className="button ghost"
                                                    type="button"
                                                    title="Switch back to dropdown"
                                                    onClick={() => {
                                                        setCustomChannelInput(false);
                                                        if (!allChannels.includes(form.channel)) {
                                                            setForm({ ...form, channel: salesChannels[1] ?? 'Walk-In' });
                                                        }
                                                    }}
                                                >✕</button>
                                            </div>
                                        ) : (
                                            <select
                                                className="select"
                                                value={allChannels.includes(form.channel) ? form.channel : '__custom__'}
                                                onChange={(event) => {
                                                    if (event.target.value === '__custom__') {
                                                        setCustomChannelInput(true);
                                                        setForm({ ...form, channel: '' });
                                                    } else {
                                                        setForm({ ...form, channel: event.target.value });
                                                    }
                                                }}
                                            >
                                                {allChannels.map((channel) => (
                                                    <option key={channel} value={channel}>
                                                        {channel}
                                                    </option>
                                                ))}
                                                <option value="__custom__">Custom...</option>
                                            </select>
                                        )}
                                    </label>
                                    <label className="field">
                                        <span>Status <span style={{ color: 'var(--danger)' }}>*</span></span>
                                        <select
                                            className="select"
                                            value={form.status}
                                            onChange={(event) => setForm({ ...form, status: event.target.value })}
                                        >
                                            {saleStatuses.map((status) => (
                                                <option key={status} value={status}>
                                                    {saleLabel(status)}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="field">
                                        <span>PO number (optional)</span>
                                        <input
                                            className="input"
                                            placeholder="Purchase Order #"
                                            value={form.po_number}
                                            onChange={(event) => setForm({ ...form, po_number: event.target.value })}
                                        />
                                    </label>
                                    <label className="field">
                                        <span>Invoice type (optional)</span>
                                        <input
                                            className="input"
                                            placeholder="e.g. SI, DR"
                                            value={form.invoice_type}
                                            onChange={(event) => setForm({ ...form, invoice_type: event.target.value })}
                                        />
                                    </label>
                                    <label className="field span-2">
                                        <span>Remarks (optional)</span>
                                        <textarea
                                            className="textarea"
                                            rows="3"
                                            placeholder="Any additional notes..."
                                            value={form.remarks}
                                            onChange={(event) => setForm({ ...form, remarks: event.target.value })}
                                        />
                                    </label>
                                </div>

                                <div className="sale-lines">
                                    <div className="sale-lines-head">
                                        <strong>Line items</strong>
                                        <button className="button secondary" type="button" onClick={addLine}>
                                            Add line
                                        </button>
                                    </div>
                                    {form.items.map((item, index) => {
                                        const lineColors = [
                                            { border: 'rgba(15, 118, 110, 0.5)', bg: 'rgba(15, 118, 110, 0.08)', accent: '#0d6760' },
                                            { border: 'rgba(196, 109, 47, 0.5)', bg: 'rgba(196, 109, 47, 0.08)', accent: '#b0612a' },
                                            { border: 'rgba(51, 103, 163, 0.5)', bg: 'rgba(51, 103, 163, 0.08)', accent: '#2b5689' },
                                            { border: 'rgba(47, 125, 70, 0.5)', bg: 'rgba(47, 125, 70, 0.08)', accent: '#266538' },
                                            { border: 'rgba(183, 121, 31, 0.5)', bg: 'rgba(183, 121, 31, 0.08)', accent: '#9a661a' }
                                        ];
                                        const color = lineColors[index % lineColors.length];

                                        return (
                                            <div key={item.key} className="sale-line" style={{
                                                backgroundColor: color.bg,
                                                padding: '24px',
                                                borderRadius: 'var(--radius-lg)',
                                                border: `2px solid ${color.border}`,
                                                marginBottom: '20px',
                                                position: 'relative',
                                                boxShadow: 'var(--shadow-soft)'
                                            }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '-12px',
                                                    left: '20px',
                                                    backgroundColor: color.accent,
                                                    color: 'white',
                                                    padding: '2px 12px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold',
                                                    zIndex: 1,
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                                }}>
                                                    Item #{index + 1}
                                                </div>
                                                <div className="field-grid sale-line-grid" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
                                                    <div className="field" style={{ gridColumn: 'span 5' }}>
                                                        <span>Product <span style={{ color: 'var(--danger)' }}>*</span></span>
                                                        <div className="stack-h" style={{ gap: '6px', alignItems: 'stretch' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <ProductSearchSelect
                                                                    products={products}
                                                                    value={item.product_id}
                                                                    onChange={(val) => selectProduct(index, val)}
                                                                    onCreateNew={(name) => onCreateProduct(index, name)}
                                                                />
                                                            </div>
                                                            <button
                                                                className="button secondary"
                                                                type="button"
                                                                title="Create new product"
                                                                style={{ padding: '0 12px', minHeight: '38px', borderRadius: '12px', flexShrink: 0 }}
                                                                onClick={() => onCreateProduct(index, '')}
                                                            >
                                                                ＋
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <label className="field" style={{ gridColumn: 'span 2' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                            <span>Qty <span style={{ color: 'var(--danger)' }}>*</span></span>
                                                            {preview.lines[index]?.isOverStock && (
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 700 }}>
                                                                    ⚠ {formatQuantity(preview.lines[index].availableStock)} left
                                                                </span>
                                                            )}
                                                        </span>
                                                        <input
                                                            className={`input ${preview.lines[index]?.isOverStock ? 'input-danger' : ''}`}
                                                            type="number"
                                                            step="0.01"
                                                            value={item.qty}
                                                            onChange={(event) => updateLine(index, { qty: event.target.value, gross_override: null })}
                                                        />
                                                    </label>
                                                    <label className="field" style={{ gridColumn: 'span 2' }}>
                                                        <span>Unit</span>
                                                        <select
                                                            className="select"
                                                            value={item.unit}
                                                            onChange={(event) => updateLineUnit(index, event.target.value)}
                                                        >
                                                            <option value={item.unit}>{item.unit}</option>
                                                            {getProductSaleUnitOptions(products.find(p => p.id === item.product_id)).filter(u => u !== item.unit).map(u => (
                                                                <option key={u} value={u}>{u}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <div className="line-actions" style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'end', justifyContent: 'flex-end', paddingBottom: '10px' }}>
                                                        <button className="button ghost" type="button" onClick={() => removeLine(index)}>
                                                            Remove
                                                        </button>
                                                    </div>

                                                    {/* Second row of fields */}
                                                    <label className="field" style={{ gridColumn: 'span 3' }}>
                                                        <span>Unit price</span>
                                                        <input
                                                            className="input"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.unit_price !== '' && item.unit_price !== undefined ? item.unit_price : (roundMoney(preview.lines[index]?.unitPrice) ?? '')}
                                                            onChange={(event) => updateLine(index, { unit_price: event.target.value, gross_override: null })}
                                                        />
                                                    </label>
                                                    <label className="field" style={{ gridColumn: 'span 3' }}>
                                                        <span>Unit cost</span>
                                                        <input
                                                            className="input"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.unit_cost !== '' && item.unit_cost !== undefined ? item.unit_cost : (roundMoney(preview.lines[index]?.costing) ?? '')}
                                                            onChange={(event) => updateLine(index, { unit_cost: event.target.value })}
                                                        />
                                                    </label>
                                                    <label className="field" style={{ gridColumn: 'span 3' }}>
                                                        <span>Shipping fee</span>
                                                        <input
                                                            className="input"
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            placeholder="0"
                                                            value={item.shipping_fee !== '' && item.shipping_fee !== undefined ? item.shipping_fee : ''}
                                                            onChange={(event) => updateLine(index, { shipping_fee: event.target.value, gross_override: null })}
                                                        />
                                                    </label>
                                                    <label className="field" style={{ gridColumn: 'span 3' }}>
                                                        <span>Total price</span>
                                                        <input
                                                            className="input"
                                                            type="number"
                                                            step="0.01"
                                                            value={item.total_price !== undefined && item.total_price !== '' ? item.total_price : (roundMoney(preview.lines[index]?.grossAmount) ?? '')}
                                                            onChange={(event) => {
                                                                const val = event.target.value;
                                                                updateLine(index, {
                                                                    total_price: val,
                                                                    gross_override: val !== '' ? parseFloat(val) : null
                                                                });
                                                            }}
                                                        />
                                                    </label>
                                                    <label className="checkbox-field compact" style={{ gridColumn: 'span 3', alignSelf: 'end' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(item.is_vat_exempt)}
                                                            onChange={(event) => updateLine(index, { is_vat_exempt: event.target.checked })}
                                                        />
                                                        <span>VAT exempt</span>
                                                    </label>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="form-actions sale-form-actions">
                                    <button className="button primary" type="submit">
                                        Save sale
                                    </button>
                                    <button className="button secondary" type="button" onClick={onCancel}>
                                        Cancel
                                    </button>
                                </div>
                            </form>

                            <div className="sales-right-col">
                                <div style={{ padding: '0 4px', marginBottom: '16px' }}>
                                    <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '4px' }}>Sale preview</strong>
                                    <span className="muted" style={{ fontSize: '0.9rem' }}>What this transaction will look like when saved.</span>
                                </div>
                                {preview.lines.some(line => line.isOverStock) && (
                                    <div style={{
                                        marginBottom: '16px',
                                        padding: '12px',
                                        backgroundColor: 'rgba(191, 76, 43, 0.1)',
                                        border: '1px solid var(--danger)',
                                        borderRadius: 'var(--radius-md)',
                                        color: 'var(--danger)',
                                        fontSize: '0.88rem',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <span>⚠</span>
                                        <span>
                                            Lack of stock: {preview.lines
                                                .filter(line => line.isOverStock)
                                                .map(line => line.productName)
                                                .filter(Boolean)
                                                .join(', ')}
                                        </span>
                                    </div>
                                )}
                                {preview.lines.length === 0 ? (
                                    <EmptyState
                                        title="Pick products to preview totals"
                                        description="Select one or more products above and the VAT/profit snapshot will appear here."
                                    />
                                ) : (
                                    <div className="preview-stack">
                                        <div className="summary-grid">
                                            <MetricCard label="Gross" value={formatCurrency(preview.grossAmount)} tone="primary" />
                                            <MetricCard label="Output VAT" value={formatCurrency(preview.outputVat)} tone="warning" />
                                            <MetricCard label="Net of Vat:" value={formatCurrency(preview.inputVat)} tone="info" />
                                            <MetricCard label="Profit" value={formatCurrency(preview.profit)} tone="success" />
                                        </div>
                                        <div className="preview-breakdown">
                                            <div className="preview-row">
                                                <span>VAT-exempt sales</span>
                                                <strong>{formatCurrency(preview.vatExemptAmount)}</strong>
                                            </div>
                                            <div className="preview-row">
                                                <span>Total cost</span>
                                                <strong>{formatCurrency(preview.totalCost)}</strong>
                                            </div>
                                            {form.status === 'FAILED' ? (
                                                <Pill tone="danger">Failed delivery will save zero quantity and zero amounts.</Pill>
                                            ) : null}
                                        </div>
                                        <div className="mini-list">
                                            {preview.lines.map((line, index) => (
                                                <div key={`${line.productId}-${index}`} className="mini-list-row">
                                                    {line.photoPath ? (
                                                        <img
                                                            className="sale-line-thumb"
                                                            src={window.agriLedger.sync.resolvePhotoUrl(line.photoPath)}
                                                            alt={line.productName}
                                                        />
                                                    ) : null}
                                                    <div>
                                                        <strong>{line.productName}</strong>
                                                        <span>
                                                            {formatQuantity(line.qty)} {line.unit} x {formatCurrency(line.unitPrice)}
                                                            {line.stockQtyOut > 0 ? ` | stock used ${formatQuantity(line.stockQtyOut)}` : ''}
                                                        </span>
                                                    </div>
                                                    <div className="mini-list-metrics">
                                                        <div className="stack" style={{ alignItems: 'flex-end', gap: '2px' }}>
                                                            <strong>{formatCurrency(line.grossAmount)}</strong>
                                                            {line.currentBatchStock < (line.availableStock || 0) && (
                                                                <span className="pill tone-warning" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                                                                    {formatQuantity(line.currentBatchStock)} old stock
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span>{formatCurrency(line.profit)} profit</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="filter-bar" ref={filterPanelRef}>
                <div className="stack-h" style={{ gap: '8px' }}>
                    <select
                        className="select select-compact"
                        style={{ width: 'auto', minWidth: '130px' }}
                        value={sortConfig.key}
                        onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
                    >
                        <option value="date">Sort by Date</option>
                        <option value="receiptNumber">Sort by Receipt #</option>
                        <option value="productName">Sort by Product</option>
                        <option value="grossAmount">Sort by Gross</option>
                        <option value="outputVat">Sort by Output VAT</option>
                        <option value="inputVat">Sort by Input VAT</option>
                        <option value="profit">Sort by Profit</option>
                        <option value="customerName">Sort by Customer</option>
                        <option value="status">Sort by Status</option>
                        <option value="companyName">Sort by Company</option>
                    </select>
                    <button
                        className="button secondary icon-button-compact"
                        type="button"
                        onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                        title={sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </button>
                </div>

                <button className="button primary" type="button" onClick={onCreateNew}>
                    Add sale
                </button>
                <input
                    className="input input-compact"
                    placeholder="Search sales..."
                    value={filters.search}
                    onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                />
                <div className="filter-dropdown-wrapper">
                    <button
                        className={`button secondary filter-toggle-btn ${filterOpen ? 'active' : ''}`}
                        type="button"
                        onClick={() => setFilterOpen(!filterOpen)}
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 2h12M3 7h8M5 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                        Filter
                        {activeFilterCount > 0 ? (
                            <span className="filter-badge">{activeFilterCount}</span>
                        ) : null}
                    </button>
                    {filterOpen ? (
                        <div className="filter-dropdown">
                            <div className="filter-dropdown-header">
                                <span className="filter-dropdown-title">Filter</span>
                                {activeFilterCount > 0 ? (
                                    <button className="filter-clear-btn" type="button" onClick={clearFilters}>
                                        Clear
                                    </button>
                                ) : null}
                            </div>
                            <div className="filter-dropdown-body">
                                <div className="filter-row">
                                    <label className="filter-row-label">Status</label>
                                    <select
                                        className="select filter-select"
                                        value={filters.status}
                                        onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                                    >
                                        <option value="all">All statuses</option>
                                        {saleStatuses.map((status) => (
                                            <option key={status} value={status}>
                                                {saleLabel(status)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="filter-row">
                                    <label className="filter-row-label">Channel</label>
                                    <select
                                        className="select filter-select"
                                        value={filters.channel}
                                        onChange={(event) => setFilters({ ...filters, channel: event.target.value })}
                                    >
                                        <option value="all">All channels</option>
                                        {allChannels.map((channel) => (
                                            <option key={channel} value={channel}>
                                                {channel}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="filter-row">
                                    <label className="filter-row-label">Company</label>
                                    <select
                                        className="select filter-select"
                                        value={filters.companyName}
                                        onChange={(event) => setFilters({ ...filters, companyName: event.target.value })}
                                    >
                                        <option value="all">All companies</option>
                                        {companyNames.map((companyName) => (
                                            <option key={companyName} value={companyName}>
                                                {companyName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="filter-row">
                                    <label className="filter-row-label">Date range</label>
                                    <div className="filter-date-pair">
                                        <div className="filter-date-field">
                                            <span className="filter-date-label">From</span>
                                            <input
                                                className="input filter-date-input"
                                                type="date"
                                                value={filters.fromDate}
                                                onChange={(event) => setFilters({ ...filters, fromDate: event.target.value })}
                                            />
                                        </div>
                                        <div className="filter-date-field">
                                            <span className="filter-date-label">To</span>
                                            <input
                                                className="input filter-date-input"
                                                type="date"
                                                value={filters.toDate}
                                                onChange={(event) => setFilters({ ...filters, toDate: event.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <Panel
                title="Sales register"
                subtitle={`${filteredSales.length} of ${sales.length} transactions shown`}
                actions={
                    selectedIds.length > 0 && (
                        <button
                            className="button danger"
                            type="button"
                            onClick={() => {
                                onBulkDelete(selectedIds);
                                setSelectedIds([]);
                            }}
                        >
                            Delete Selected ({selectedIds.length})
                        </button>
                    )
                }
            >
                {filteredSales.length === 0 ? (
                    <EmptyState title="No sales found" description="Adjust the filters or record the first transaction." />
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="table-checkbox-cell">
                                        <input
                                            type="checkbox"
                                            className="table-checkbox"
                                            checked={selectedIds.length === filteredSales.length && filteredSales.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedIds(filteredSales.map((s) => s.id));
                                                } else {
                                                    setSelectedIds([]);
                                                }
                                            }}
                                        />
                                    </th>
                                    <th onClick={() => handleSort('date')} className="sortable-header">
                                        <div className="header-sort-content">
                                            Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('companyName')} className="sortable-header">
                                        <div className="header-sort-content">
                                            Company {sortConfig.key === 'companyName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th>SI #</th>
                                    <th onClick={() => handleSort('receiptNumber')} className="sortable-header">
                                        <div className="header-sort-content">
                                            Receipt # {sortConfig.key === 'receiptNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('customerName')} className="sortable-header">
                                        <div className="header-sort-content">
                                            Customer {sortConfig.key === 'customerName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th>Channel</th>
                                    <th>Status</th>
                                    <th onClick={() => handleSort('grossAmount')} className="sortable-header numeric">
                                        <div className="header-sort-content numeric">
                                            Gross {sortConfig.key === 'grossAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('outputVat')} className="sortable-header numeric">
                                        <div className="header-sort-content numeric">
                                            Output VAT {sortConfig.key === 'outputVat' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('inputVat')} className="sortable-header numeric">
                                        <div className="header-sort-content numeric">
                                            Input VAT {sortConfig.key === 'inputVat' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('profit')} className="sortable-header numeric">
                                        <div className="header-sort-content numeric">
                                            Profit {sortConfig.key === 'profit' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedSales.map((sale) => (
                                    <tr
                                        key={sale.id}
                                        className={`${selectedIds.includes(sale.id) ? 'selected-row' : ''} ${activeSaleId === sale.id ? 'active' : ''}`}
                                        onClick={() => {
                                            if (window.getSelection().toString()) return;
                                            setActiveSaleId(sale.id === activeSaleId ? null : sale.id);
                                        }}
                                        style={{ position: 'relative' }}
                                    >
                                        <td className="table-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="table-checkbox"
                                                checked={selectedIds.includes(sale.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedIds([...selectedIds, sale.id]);
                                                    } else {
                                                        setSelectedIds(id => id.filter((id) => id !== sale.id));
                                                    }
                                                }}
                                            />
                                        </td>
                                        <td>{formatDateShort(sale.date)}</td>
                                        <td>{sale.companyName}</td>
                                        <td>{sale.siNumber || '-'}</td>
                                        <td>{sale.receiptNumber ? String(sale.receiptNumber).padStart(4, '0') : '-'}</td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{sale.customerName || 'Walk-in'}</div>
                                            {sale.items && sale.items.length > 0 && (
                                                <div className="muted" style={{ fontSize: '0.72rem', marginTop: '2px', lineHeight: 1.4, color: 'var(--primary-strong)', opacity: 0.8 }}>
                                                    {sale.items.map(i => `${i.name} (x${formatQuantity(i.qty)})`).join(', ')}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <Pill channel={sale.channel}>{sale.channel}</Pill>
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <select
                                                className={`pill tone-${statusTone(sale.status)}`}
                                                value={sale.status}
                                                onChange={(e) => onUpdateStatus && onUpdateStatus(sale.id, e.target.value)}
                                                style={{
                                                    cursor: 'pointer',
                                                    border: 'none',
                                                    outline: 'none',
                                                    appearance: 'none',
                                                    WebkitAppearance: 'none',
                                                    paddingRight: '16px',
                                                    backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 4l3 3 3-3'/%3E%3C/svg%3E")`,
                                                    backgroundRepeat: 'no-repeat',
                                                    backgroundPosition: 'right 6px center',
                                                    backgroundSize: '10px'
                                                }}
                                            >
                                                {saleStatuses.map((s) => (
                                                    <option key={s} value={s}>{saleLabel(s)}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="numeric">{formatCurrency(sale.grossAmount)}</td>
                                        <td className="numeric">{formatCurrency(sale.outputVat)}</td>
                                        <td className="numeric">{formatCurrency(sale.inputVat)}</td>
                                        <td className="numeric">{formatCurrency(sale.profit)}</td>

                                        {activeSaleId === sale.id && (
                                            <td className="row-overlay-cell" onClick={(e) => e.stopPropagation()}>
                                                <div className="product-card-overlay" style={{ borderRadius: 0, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setActiveSaleId(null)}>
                                                    <div className="quick-view-box" style={{
                                                        background: 'var(--panel-solid)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 'var(--radius-xl)',
                                                        padding: '24px',
                                                        boxShadow: 'var(--shadow)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'stretch',
                                                        gap: '16px',
                                                        width: '100%',
                                                        maxWidth: '450px',
                                                        maxHeight: '90vh',
                                                        overflowY: 'auto',
                                                        animation: 'overlayFadeIn 300ms cubic-bezier(0.16, 1, 0.3, 1)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
                                                            <button
                                                                className="modal-close"
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setActiveSaleId(null); }}
                                                                style={{ position: 'static', width: '32px', height: '32px' }}
                                                                aria-label="Close"
                                                            >✕</button>
                                                        </div>
                                                        <div className="quick-view-items-stack" style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '16px',
                                                            maxHeight: '440px',
                                                            overflowY: 'auto',
                                                            paddingRight: '6px'
                                                        }}>
                                                            {sale.items.filter(i => i.name).map((item, i) => (
                                                                <div key={i} style={{
                                                                    background: 'var(--panel-strong)',
                                                                    border: '1px solid var(--border)',
                                                                    borderRadius: 'var(--radius-lg)',
                                                                    padding: '16px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '20px',
                                                                    boxShadow: 'var(--shadow-soft)'
                                                                }}>
                                                                    <div style={{
                                                                        width: '40px',
                                                                        height: '40px',
                                                                        background: 'var(--primary-fade)',
                                                                        color: 'var(--primary-strong)',
                                                                        borderRadius: '10px',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '1rem',
                                                                        flexShrink: 0,
                                                                        fontWeight: 800
                                                                    }}>{i + 1}</div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>{item.name}</div>
                                                                        <div className="muted" style={{ fontSize: '0.8rem', display: 'flex', gap: '12px' }}>
                                                                            <span>{formatQuantity(item.qty)} {item.unit}</span>
                                                                            <span>•</span>
                                                                            <span>{formatCurrency(item.price)} / {item.unit}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ fontWeight: 700, color: 'var(--primary-strong)' }}>
                                                                        {formatCurrency(item.qty * item.price)}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className="product-card-overlay-actions" style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(3, 1fr)',
                                                            width: '100%',
                                                            gap: '16px',
                                                            marginTop: '8px',
                                                            paddingTop: '20px',
                                                            borderTop: '1px solid var(--border)'
                                                        }} onClick={(e) => e.stopPropagation()}>
                                                            <button className="button primary" style={{ width: '100%', borderRadius: 'var(--radius-md)', padding: '12px', fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); onViewReceipt(sale.id); setActiveSaleId(null); }}>Receipt</button>
                                                            <button className="button secondary" style={{ width: '100%', borderRadius: 'var(--radius-md)', padding: '12px', fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); onEdit && onEdit(sale); setActiveSaleId(null); }}>Edit</button>
                                                            <button className="button danger" style={{ width: '100%', borderRadius: 'var(--radius-md)', padding: '12px', fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); onDelete(sale.id); setActiveSaleId(null); }}>Delete</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredSales.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </Panel>
        </div>
    );
}

function PurchasesTab({
    purchases,
    products,
    suppliers,
    taxSettings,
    filters,
    setFilters,
    showForm,
    form,
    setForm,
    onSubmit,
    onCreateNew,
    onEdit,
    onDelete,
    onBulkDelete,
    onCancel,
    onExport,
    onImport,
    onUploadItemPhoto,
    onCreateSupplier,
    onViewVoucher
}) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [activePurchaseId, setActivePurchaseId] = useState(null);
    const purchaseDateInputRef = useRef(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterPanelRef = useRef(null);
    const [customCategoryInput, setCustomCategoryInput] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Compute supplier-specific products purchased in past purchases
    const supplierProducts = useMemo(() => {
        if (!form.supplier_name) return { ids: new Set(), codes: new Set() };
        const ids = new Set();
        const codes = new Set();
        for (const p of purchases) {
            if (p.supplierName && p.supplierName.toLowerCase() === form.supplier_name.toLowerCase()) {
                for (const item of (p.items || [])) {
                    if (item.productId) ids.add(item.productId);
                    if (item.productCode) codes.add(item.productCode);
                }
            }
        }
        return { ids, codes };
    }, [purchases, form.supplier_name]);

    // Build a merged list of all companies: predefined + any custom ones found in existing purchases
    const allCompanyNames = Array.from(new Set([
        ...companyNames,
        ...purchases.map((p) => (p.companyName || '').trim()).filter(Boolean)
    ])).sort();

    // Build a merged list of all categories: predefined + any custom ones found in existing purchases
    const allExpenseCategories = Array.from(new Set([
        ...expenseCategories,
        ...purchases.map((p) => (p.expenseCategory || '').trim()).filter(Boolean)
    ])).sort();

    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    function handleSort(key) {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    }

    const addItem = () => {
        setForm({
            ...form,
            items: [...(form.items || []), blankPurchaseItem()]
        });
    };

    const removeItem = (index) => {
        const nextItems = [...(form.items || [])];
        nextItems.splice(index, 1);
        setForm({ ...form, items: nextItems });
    };

    const updateItem = (index, updates) => {
        const nextItems = [...(form.items || [])];
        const oldItem = nextItems[index];
        nextItems[index] = { ...oldItem, ...updates };

        // Ghost row logic: if typing in the last row and it's not empty anymore, add a new one
        if (index === nextItems.length - 1) {
            const hasContent = updates.product_id || updates.product_name || updates.product_code;
            if (hasContent) {
                nextItems.push(blankPurchaseItem());
            }
        }

        // Auto-calculate gross amount for the line if qty or cost changes
        if ('quantity' in updates || 'unit_cost' in updates) {
            const qty = toNumber(nextItems[index].quantity);
            const cost = toNumber(nextItems[index].unit_cost);
            nextItems[index].gross_amount = String(roundMoney(qty * cost));
        }

        setForm({ ...form, items: nextItems });
    };

    useEffect(() => {
        if (purchaseDateInputRef.current) {
            requestAnimationFrame(() => {
                purchaseDateInputRef.current?.focus();
            });
        }
    }, [form.id]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (filterPanelRef.current && !filterPanelRef.current.contains(event.target)) {
                setFilterOpen(false);
            }
            if (activePurchaseId && !event.target.closest('.table tr')) {
                setActivePurchaseId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [filterOpen, activePurchaseId]);

    const defaultFilters = { search: '', category: 'all', companyName: 'all', fromDate: '', toDate: '' };

    function clearFilters() {
        setFilters(defaultFilters);
    }

    const activeFilterCount = [
        filters.category !== 'all',
        filters.companyName !== 'all',
        Boolean(filters.fromDate),
        Boolean(filters.toDate)
    ].filter(Boolean).length;

    const filteredPurchases = useMemo(() => {
        return purchases.filter((purchase) => {
            const query = filters.search.trim().toLowerCase();
            const matchesSearch =
                !query ||
                [purchase.companyName, purchase.supplierName, purchase.receiptNumber, purchase.address, purchase.expenseCategory, purchase.supplierTin]
                    .join(' ')
                    .toLowerCase()
                    .includes(query);
            const matchesCategory = filters.category === 'all' || purchase.expenseCategory === filters.category;
            const matchesCompany = filters.companyName === 'all' || purchase.companyName === filters.companyName;
            const matchesFrom = !filters.fromDate || purchase.date >= filters.fromDate;
            const matchesTo = !filters.toDate || purchase.date <= filters.toDate;
            return matchesSearch && matchesCategory && matchesCompany && matchesFrom && matchesTo;
        });
    }, [purchases, filters]);

    const sortedPurchases = useMemo(() => {
        return [...filteredPurchases].sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (sortConfig.key === 'productName') {
                aValue = Array.isArray(a.items) && a.items.length > 0
                    ? a.items.map(item => item.productName || '').filter(Boolean).join(', ')
                    : '';
                bValue = Array.isArray(b.items) && b.items.length > 0
                    ? b.items.map(item => item.productName || '').filter(Boolean).join(', ')
                    : '';
            }

            if (['gross_amount', 'net_of_vat', 'input_vat', 'grossAmount', 'netOfVat', 'inputVat'].includes(sortConfig.key)) {
                const numA = Number(aValue) || 0;
                const numB = Number(bValue) || 0;
                return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
            }

            const strA = (aValue || '').toString().toLowerCase();
            const strB = (bValue || '').toString().toLowerCase();

            if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredPurchases, sortConfig]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters, pageSize]);

    const paginatedPurchases = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedPurchases.slice(start, start + pageSize);
    }, [sortedPurchases, currentPage, pageSize]);

    const preview = summarizePurchasePreview(form, taxSettings?.vatRate);

    return (
        <div className="stack">
            {/* â”€â”€ Modal overlay for add / edit â”€â”€ */}
            {showForm ? (
                <div className="modal-backdrop">
                    <div className={`modal-box ${form.expense_category === 'Materials & Supplies' ? 'modal-wide' : 'modal-large'}`} style={{ width: '95%', maxWidth: form.expense_category === 'Materials & Supplies' ? '1100px' : '800px' }}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title" style={{ fontSize: '1.25rem' }}>{form.id ? 'Edit purchase / expense' : 'Add purchase / expense'}</h3>
                                <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>Track expenses and compute VAT automatically.</p>
                            </div>
                            <button className="modal-close" type="button" onClick={onCancel} aria-label="Close">✕</button>
                        </div>

                        <form className="form-stack" onSubmit={onSubmit} style={{ gap: '16px' }}>
                            {form.expense_category === 'Materials & Supplies' ? (
                                /* ── Materials & Supplies: Responsive Layout ── */
                                <div className="materials-supplies-layout" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {/* Top: Responsive grid that wraps automatically */}
                                    <div className="field-grid" style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                        gap: '12px'
                                    }}>
                                        <label className="field">
                                            <span>DATE <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <input ref={purchaseDateInputRef} className="input input-compact" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>COMPANY <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <select className="select select-compact" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })}>
                                                {allCompanyNames.map((c) => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </label>
                                        <div className="field">
                                            <span>SUPPLIER <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <div className="stack-h" style={{ gap: '6px', alignItems: 'stretch' }}>
                                                <div style={{ flex: 1 }}>
                                                    <SupplierSearchSelect
                                                        suppliers={suppliers}
                                                        value={form.supplier_name}
                                                        onChange={(name, tin, addr) => {
                                                            const updates = { supplier_name: name };
                                                            if (tin) updates.supplier_tin = tin;
                                                            if (addr) updates.address = addr;
                                                            setForm({ ...form, ...updates });
                                                        }}
                                                        onCreateNew={onCreateSupplier}
                                                    />
                                                </div>
                                                <button
                                                    className="button secondary"
                                                    type="button"
                                                    title="Create new supplier"
                                                    style={{ padding: '0 12px', minHeight: '38px', borderRadius: '12px', flexShrink: 0 }}
                                                    onClick={() => onCreateSupplier('')}
                                                >
                                                    ＋
                                                </button>
                                            </div>
                                        </div>
                                        <label className="field">
                                            <span>RECEIPT # <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <input className="input input-compact" placeholder="OR / Invoice #" value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>Supplier TIN</span>
                                            <input className="input input-compact" placeholder="Taxpayer ID" value={form.supplier_tin} onChange={(e) => setForm({ ...form, supplier_tin: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>CATEGORY <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <select className="select select-compact" value={allExpenseCategories.includes(form.expense_category) ? form.expense_category : 'Materials & Supplies'} onChange={(e) => setForm({ ...form, expense_category: e.target.value })}>
                                                {allExpenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </label>
                                        <label className="field">
                                            <span>Address</span>
                                            <input className="input input-compact" placeholder="Supplier address..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>Contact #</span>
                                            <input className="input input-compact" placeholder="Phone or mobile..." value={form.supplier_contact} onChange={(e) => setForm({ ...form, supplier_contact: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>Supplier Category</span>
                                            <input className="input input-compact" placeholder="e.g. Feed Mill, Vet Clinic" value={form.supplier_category} onChange={(e) => setForm({ ...form, supplier_category: e.target.value })} />
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                                            <label className="field checkbox-field compact" style={{ margin: 0 }}>
                                                <input type="checkbox" checked={Boolean(form.is_vat_exempt)} onChange={(e) => setForm({ ...form, is_vat_exempt: e.target.checked })} />
                                                <span>VAT exempt</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Middle: Table Container (Allowed to overflow so dropdown is visible) */}
                                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <h4 style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>LINE ITEMS / INVENTORY</h4>
                                            <button type="button" className="button ghost primary" onClick={addItem} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>+ Add Line</button>
                                        </div>
                                        <div style={{ minHeight: '100px' }}>
                                            <table className="table-premium-entry" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '28px' }}></th>
                                                        <th style={{ width: '200px' }}>PRODUCT CODE</th>
                                                        <th>PRODUCT NAME</th>
                                                        <th style={{ width: '80px' }} className="text-right">QTY</th>
                                                        <th style={{ width: '70px' }}>UNIT</th>
                                                        <th style={{ width: '100px' }} className="text-right">COST</th>
                                                        <th style={{ width: '100px' }} className="text-right">SRP</th>
                                                        <th style={{ width: '120px' }} className="text-right">AMOUNT</th>
                                                        <th style={{ width: '70px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(form.items || []).map((item, index) => (
                                                        <PurchaseItemRow
                                                            key={index}
                                                            item={item}
                                                            index={index}
                                                            products={products}
                                                            supplierProducts={supplierProducts}
                                                            onUpdate={updateItem}
                                                            onRemove={removeItem}
                                                            onUploadPhoto={(e) => onUploadItemPhoto && onUploadItemPhoto(index, e)}
                                                            isLast={index === (form.items || []).length - 1}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Bottom: Flexible Summary and Actions */}
                                    <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '20px',
                                        marginTop: '8px'
                                    }}>
                                        <div className="form-actions" style={{ margin: 0, gap: '8px', flex: '0 1 auto' }}>
                                            <button className="button primary" type="submit" style={{ padding: '10px 24px' }}>{form.id ? 'Update' : 'Save'}</button>
                                            <button className="button secondary" type="button" onClick={onCancel}>Cancel</button>
                                        </div>
                                        <div className="summary-grid compact" style={{
                                            margin: 0,
                                            padding: 0,
                                            width: 'auto',
                                            flex: '1 1 600px',
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(3, 1fr)',
                                            gap: '8px'
                                        }}>
                                            <MetricCard label="NET OF VAT" value={formatCurrency(preview.netOfVat)} tone="primary" />
                                            <MetricCard label="INPUT VAT" value={formatCurrency(preview.inputVat)} tone="warning" />
                                            <MetricCard label="GROSS TOTAL" value={formatCurrency(preview.grossAmount)} tone="success" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* ── Non-materials: Responsive single-column layout ── */
                                <>
                                    <div className="field-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                        <label className="field">
                                            <span>DATE <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <input ref={purchaseDateInputRef} className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>COMPANY <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <select className="select" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })}>
                                                {allCompanyNames.map((c) => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </label>
                                        <label className="field">
                                            <span>Supplier TIN</span>
                                            <input className="input" placeholder="Taxpayer ID" value={form.supplier_tin} onChange={(e) => setForm({ ...form, supplier_tin: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>SUPPLIER <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <div className="stack-h" style={{ gap: '6px', alignItems: 'stretch' }}>
                                                <div style={{ flex: 1 }}>
                                                    <SupplierSearchSelect
                                                        suppliers={suppliers}
                                                        value={form.supplier_name}
                                                        onChange={(name, tin, addr) => {
                                                            const updates = { supplier_name: name };
                                                            if (tin) updates.supplier_tin = tin;
                                                            if (addr) updates.address = addr;
                                                            setForm({ ...form, ...updates });
                                                        }}
                                                        onCreateNew={onCreateSupplier}
                                                    />
                                                </div>
                                                <button
                                                    className="button secondary"
                                                    type="button"
                                                    title="Create new supplier"
                                                    style={{ padding: '0 12px', minHeight: '38px', borderRadius: '12px', flexShrink: 0 }}
                                                    onClick={() => onCreateSupplier('')}
                                                >
                                                    ＋
                                                </button>
                                            </div>
                                        </label>
                                        <label className="field">
                                            <span>RECEIPT # <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <input className="input" placeholder="OR / Invoice #" value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span>CATEGORY <span style={{ color: 'var(--danger)' }}>*</span></span>
                                            <select className="select" value={allExpenseCategories.includes(form.expense_category) ? form.expense_category : 'Materials & Supplies'} onChange={(e) => setForm({ ...form, expense_category: e.target.value })}>
                                                {allExpenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </label>
                                        <label className="field" style={{ gridColumn: '1 / -1' }}>
                                            <span>Address (optional)</span>
                                            <input className="input" placeholder="Complete supplier address..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                                        </label>
                                        <label className="field checkbox-field">
                                            <input type="checkbox" checked={Boolean(form.is_vat_exempt)} onChange={(e) => setForm({ ...form, is_vat_exempt: e.target.checked })} />
                                            <span>VAT exempt</span>
                                        </label>
                                    </div>

                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                                        <div className="field-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                                            <label className="field">
                                                <span>GROSS AMOUNT <span style={{ color: 'var(--danger)' }}>*</span></span>
                                                <input className="input" type="number" step="0.01" min="0" placeholder="0.00" value={form.gross_amount} onChange={(e) => setForm({ ...form, gross_amount: e.target.value })} />
                                            </label>
                                            <label className="field">
                                                <span>Remarks (optional)</span>
                                                <input className="input" placeholder="Additional notes..." value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="summary-grid compact" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                        <MetricCard label="NET OF VAT" value={formatCurrency(preview.netOfVat)} tone="primary" />
                                        <MetricCard label="INPUT VAT" value={formatCurrency(preview.inputVat)} tone="warning" />
                                        <MetricCard label="GROSS AMOUNT" value={formatCurrency(preview.grossAmount)} tone="success" />
                                    </div>

                                    <div className="form-actions">
                                        <button className="button primary" type="submit">{form.id ? 'Update' : 'Save'}</button>
                                        <button className="button secondary" type="button" onClick={onCancel}>Cancel</button>
                                    </div>
                                </>
                            )}
                        </form>
                    </div>
                </div>
            ) : null}

            <div className="filter-bar" ref={filterPanelRef}>
                <div className="stack-h" style={{ gap: '8px' }}>
                    <select
                        className="select select-compact"
                        style={{ width: 'auto', minWidth: '130px' }}
                        value={sortConfig.key}
                        onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
                    >
                        <option value="date">Sort by Date</option>
                        <option value="receiptNumber">Sort by Receipt #</option>
                        <option value="productName">Sort by Product</option>
                        <option value="grossAmount">Sort by Gross</option>
                        <option value="supplierName">Sort by Supplier</option>
                        <option value="expenseCategory">Sort by Category</option>
                        <option value="companyName">Sort by Company</option>
                    </select>
                    <button
                        className="button secondary icon-button-compact"
                        type="button"
                        onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                        title={sortConfig.direction === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </button>
                </div>

                <button className="button primary" type="button" onClick={onCreateNew}>
                    Add purchase
                </button>
                <input
                    className="input input-compact"
                    placeholder="Search purchases..."
                    value={filters.search}
                    onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                />
                <div className="filter-dropdown-wrapper">
                    <button
                        className={`button secondary filter-toggle-btn ${filterOpen ? 'active' : ''}`}
                        type="button"
                        onClick={() => setFilterOpen(!filterOpen)}
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 2h12M3 7h8M5 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                        Filter
                        {activeFilterCount > 0 ? (
                            <span className="filter-badge">{activeFilterCount}</span>
                        ) : null}
                    </button>
                    {filterOpen ? (
                        <div className="filter-dropdown">
                            <div className="filter-dropdown-header">
                                <span className="filter-dropdown-title">Filter</span>
                                {activeFilterCount > 0 ? (
                                    <button className="filter-clear-btn" type="button" onClick={clearFilters}>
                                        Clear
                                    </button>
                                ) : null}
                            </div>
                            <div className="filter-dropdown-body">
                                <div className="filter-row">
                                    <label className="filter-row-label">Company</label>
                                    <select
                                        className="select filter-select"
                                        value={filters.companyName}
                                        onChange={(event) => setFilters({ ...filters, companyName: event.target.value })}
                                    >
                                        <option value="all">All companies</option>
                                        {companyNames.map((companyName) => (
                                            <option key={companyName} value={companyName}>
                                                {companyName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="filter-row">
                                    <label className="filter-row-label">Category</label>
                                    <select
                                        className="select filter-select"
                                        value={filters.category}
                                        onChange={(event) => setFilters({ ...filters, category: event.target.value })}
                                    >
                                        <option value="all">All categories</option>
                                        {allExpenseCategories.map((category) => (
                                            <option key={category} value={category}>
                                                {category}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="filter-row">
                                    <label className="filter-row-label">Date range</label>
                                    <div className="filter-date-pair">
                                        <div className="filter-date-field">
                                            <span className="filter-date-label">From</span>
                                            <input
                                                className="input filter-date-input"
                                                type="date"
                                                value={filters.fromDate}
                                                onChange={(event) => setFilters({ ...filters, fromDate: event.target.value })}
                                            />
                                        </div>
                                        <div className="filter-date-field">
                                            <span className="filter-date-label">To</span>
                                            <input
                                                className="input filter-date-input"
                                                type="date"
                                                value={filters.toDate}
                                                onChange={(event) => setFilters({ ...filters, toDate: event.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <Panel
                title="Purchase and expense log"
                subtitle={`${filteredPurchases.length} of ${purchases.length} entries shown`}
                actions={
                    selectedIds.length > 0 && (
                        <button
                            className="button danger"
                            type="button"
                            onClick={() => {
                                onBulkDelete(selectedIds);
                                setSelectedIds([]);
                            }}
                        >
                            Delete Selected ({selectedIds.length})
                        </button>
                    )
                }
            >
                {filteredPurchases.length === 0 ? (
                    <EmptyState title="No purchases found" description="Create the first expense or widen the date range." />
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="table-checkbox-cell">
                                        <input
                                            type="checkbox"
                                            className="table-checkbox"
                                            checked={selectedIds.length === filteredPurchases.length && filteredPurchases.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedIds(filteredPurchases.map((p) => p.id));
                                                } else {
                                                    setSelectedIds([]);
                                                }
                                            }}
                                        />
                                    </th>
                                    <th onClick={() => handleSort('date')} className="sortable-header">
                                        <div className="header-sort-content">
                                            DATE {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('companyName')} className="sortable-header">
                                        <div className="header-sort-content">
                                            COMPANY {sortConfig.key === 'companyName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('supplierName')} className="sortable-header">
                                        <div className="header-sort-content">
                                            SUPPLIER {sortConfig.key === 'supplierName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('receiptNumber')} className="sortable-header">
                                        <div className="header-sort-content">
                                            RECEIPT # {sortConfig.key === 'receiptNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('productName')} className="sortable-header">
                                        <div className="header-sort-content">
                                            PRODUCT NAME {sortConfig.key === 'productName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('expenseCategory')} className="sortable-header">
                                        <div className="header-sort-content">
                                            CATEGORY {sortConfig.key === 'expenseCategory' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('grossAmount')} className="sortable-header numeric">
                                        <div className="header-sort-content numeric">
                                            GROSS AMOUNT {sortConfig.key === 'grossAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('netOfVat')} className="sortable-header numeric">
                                        <div className="header-sort-content numeric">
                                            NET OF VAT {sortConfig.key === 'netOfVat' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('inputVat')} className="sortable-header numeric">
                                        <div className="header-sort-content numeric">
                                            INPUT VAT {sortConfig.key === 'inputVat' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        </div>
                                    </th>

                                </tr>
                            </thead>
                            <tbody>
                                {paginatedPurchases.map((purchase) => (
                                    <tr
                                        key={purchase.id}
                                        className={`${selectedIds.includes(purchase.id) ? 'selected-row' : ''} ${activePurchaseId === purchase.id ? 'active' : ''}`}
                                        onClick={() => {
                                            if (window.getSelection().toString()) return;
                                            setActivePurchaseId(purchase.id === activePurchaseId ? null : purchase.id);
                                        }}
                                        style={{ position: 'relative' }}
                                    >
                                        <td className="table-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="table-checkbox"
                                                checked={selectedIds.includes(purchase.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedIds([...selectedIds, purchase.id]);
                                                    } else {
                                                        setSelectedIds(selectedIds.filter((id) => id !== purchase.id));
                                                    }
                                                }}
                                            />
                                        </td>
                                        <td>{formatDateShort(purchase.date)}</td>
                                        <td>{purchase.companyName}</td>
                                        <td>
                                            <strong>{purchase.supplierName}</strong>
                                            <div className="row-note">{purchase.supplierTin || 'No TIN'}</div>
                                        </td>
                                        <td>{purchase.receiptNumber}</td>
                                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={purchase.items?.map(i => i.productName).filter(Boolean).join(', ') || '—'}>
                                            {purchase.items?.map(i => i.productName).filter(Boolean).join(', ') || '—'}
                                        </td>
                                        <td>{purchase.expenseCategory}</td>
                                        <td className="numeric">{formatCurrency(purchase.grossAmount)}</td>
                                        <td className="numeric">{formatCurrency(purchase.netOfVat || (purchase.grossAmount - purchase.inputVat))}</td>
                                        <td className="numeric">{formatCurrency(purchase.inputVat)}</td>

                                        {activePurchaseId === purchase.id && (
                                            <td className="row-overlay-cell" onClick={(e) => e.stopPropagation()}>
                                                <div className="product-card-overlay" style={{ borderRadius: 0, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setActivePurchaseId(null)}>
                                                    <div className="quick-view-box" style={{
                                                        background: 'var(--panel-solid)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 'var(--radius-xl)',
                                                        padding: '24px',
                                                        boxShadow: 'var(--shadow)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'stretch',
                                                        gap: '16px',
                                                        width: '100%',
                                                        maxWidth: '450px',
                                                        maxHeight: '90vh',
                                                        overflowY: 'auto',
                                                        animation: 'overlayFadeIn 300ms cubic-bezier(0.16, 1, 0.3, 1)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
                                                            <button
                                                                className="modal-close"
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setActivePurchaseId(null); }}
                                                                style={{ position: 'static', width: '32px', height: '32px' }}
                                                                aria-label="Close"
                                                            >✕</button>
                                                        </div>
                                                        <div className="quick-view-items-stack" style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '16px',
                                                            maxHeight: '440px',
                                                            overflowY: 'auto',
                                                            paddingRight: '6px'
                                                        }}>
                                                            {purchase.items && purchase.items.length > 0 && purchase.items[0]?.id ? (
                                                                purchase.items.filter(i => i.productName || i.name).map((item, i) => (
                                                                    <div key={i} style={{
                                                                        background: 'var(--panel-strong)',
                                                                        border: '1px solid var(--border)',
                                                                        borderRadius: 'var(--radius-lg)',
                                                                        padding: '16px',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '20px',
                                                                        boxShadow: 'var(--shadow-soft)'
                                                                    }}>
                                                                        <div style={{
                                                                            width: '40px',
                                                                            height: '40px',
                                                                            background: 'var(--primary-fade)',
                                                                            color: 'var(--primary-strong)',
                                                                            borderRadius: '10px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontSize: '1rem',
                                                                            flexShrink: 0,
                                                                            fontWeight: 800
                                                                        }}>{i + 1}</div>
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>{item.productName || item.name}</div>
                                                                            <div className="muted" style={{ fontSize: '0.8rem', display: 'flex', gap: '12px' }}>
                                                                                <span>{formatQuantity(item.qty || item.quantity)} {item.unit}</span>
                                                                                <span>•</span>
                                                                                <span>{formatCurrency(item.unitCost || item.unit_cost)} / {item.unit}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ fontWeight: 700, color: 'var(--primary-strong)' }}>
                                                                            {formatCurrency((item.qty || item.quantity) * (item.unitCost || item.unit_cost))}
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                                                                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>Category expense</div>
                                                                    <div>{purchase.expenseCategory}</div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="product-card-overlay-actions" style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(2, 1fr)',
                                                            width: '100%',
                                                            gap: '16px',
                                                            marginTop: '8px',
                                                            paddingTop: '20px',
                                                            borderTop: '1px solid var(--border)'
                                                        }} onClick={(e) => e.stopPropagation()}>
                                                            <button className="button primary" style={{ width: '100%', borderRadius: 'var(--radius-md)', padding: '12px', fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); onEdit && onEdit(purchase); setActivePurchaseId(null); }}>Edit</button>
                                                            <button className="button danger" style={{ width: '100%', borderRadius: 'var(--radius-md)', padding: '12px', fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); onDelete(purchase.id); setActivePurchaseId(null); }}>Delete</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredPurchases.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </Panel>
        </div>
    );
}

function GainLossTab({ api, flash, companyNames }) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({
        companyName: companyNames[0] || '',
        fromDate: new Date().toISOString().slice(0, 7) + '-01',
        toDate: new Date().toISOString().slice(0, 10),
    });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const emptyForm = {
        id: '',
        companyName: companyNames[0] || '',
        date: new Date().toISOString().slice(0, 10),
        voucherNo: '',
        supplierName: '',
        amountPaid: '',
        landedCost: '',
    };
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.fct.list(filters);
            setTransactions(data);
        } catch (err) {
            flash(err.message || 'Failed to load transactions.', 'danger');
        } finally {
            setLoading(false);
        }
    }, [api, filters, flash]);

    useEffect(() => { loadData(); }, [loadData]);

    const filtered = transactions.filter(t => {
        if (!search) return true;
        const q = search.toLowerCase();
        return t.supplierName?.toLowerCase().includes(q) || t.voucherNo?.toLowerCase().includes(q);
    });

    const totalAmountPaid = roundMoney(filtered.reduce((s, t) => s + t.amountPaid, 0));
    const totalLandedCost = roundMoney(filtered.reduce((s, t) => s + t.landedCost, 0));
    const totalGain = roundMoney(filtered.reduce((s, t) => s + t.gain, 0));
    const totalLoss = roundMoney(filtered.reduce((s, t) => s + t.loss, 0));

    const openAdd = () => {
        setForm({ ...emptyForm, companyName: filters.companyName || companyNames[0] || '' });
        setIsModalOpen(true);
    };
    const openEdit = (t) => {
        setForm({
            id: t.id,
            companyName: t.companyName,
            date: t.date,
            voucherNo: t.voucherNo || '',
            supplierName: t.supplierName,
            amountPaid: String(t.amountPaid),
            landedCost: String(t.landedCost),
        });
        setIsModalOpen(true);
    };
    const closeModal = () => { setIsModalOpen(false); setForm(emptyForm); };

    const handleSave = async () => {
        if (!form.supplierName.trim()) { flash('Supplier name is required.', 'warning'); return; }
        setSaving(true);
        try {
            await api.fct.save({
                id: form.id || undefined,
                companyName: form.companyName,
                date: form.date,
                voucherNo: form.voucherNo,
                supplierName: form.supplierName.trim(),
                amountPaid: parseFloat(form.amountPaid) || 0,
                landedCost: parseFloat(form.landedCost) || 0,
            });
            flash(form.id ? 'Transaction updated.' : 'Transaction added.', 'success');
            closeModal();
            loadData();
        } catch (err) {
            flash(err.message || 'Save failed.', 'danger');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this transaction?')) return;
        try {
            await api.fct.delete(id);
            flash('Transaction deleted.', 'success');
            loadData();
        } catch (err) {
            flash(err.message || 'Delete failed.', 'danger');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Delete ${selectedIds.size} transaction(s)?`)) return;
        try {
            await api.fct.bulkDelete([...selectedIds]);
            setSelectedIds(new Set());
            flash(`${selectedIds.size} transaction(s) deleted.`, 'success');
            loadData();
        } catch (err) {
            flash(err.message || 'Bulk delete failed.', 'danger');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(t => t.id)));
        }
    };

    // Live preview gain/loss in form
    const previewAmt = parseFloat(form.amountPaid) || 0;
    const previewLand = parseFloat(form.landedCost) || 0;
    const previewDiff = roundMoney(previewLand - previewAmt);
    const previewGain = previewDiff > 0 ? previewDiff : 0;
    const previewLoss = previewDiff < 0 ? -previewDiff : 0;

    return (
        <div className="stack">
            {/* ── Filter Bar ── */}
            <div className="filter-bar" style={{ marginBottom: '1.5rem' }}>
                <div className="header-title-group" style={{ marginRight: 'auto' }}>
                    <h2 className="panel-title" style={{ fontSize: '1.1rem' }}>Gain / Loss on Foreign Currency</h2>
                </div>
                <select
                    className="select select-compact"
                    value={filters.companyName}
                    onChange={e => setFilters({ ...filters, companyName: e.target.value })}
                >
                    {companyNames.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                    className="input input-compact"
                    type="date"
                    value={filters.fromDate}
                    onChange={e => setFilters({ ...filters, fromDate: e.target.value })}
                />
                <input
                    className="input input-compact"
                    type="date"
                    value={filters.toDate}
                    onChange={e => setFilters({ ...filters, toDate: e.target.value })}
                />
                <input
                    className="input input-compact"
                    type="text"
                    placeholder="Search supplier / voucher…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <button className="button primary" onClick={openAdd}>+ Add Transaction</button>
                {selectedIds.size > 0 && (
                    <button className="button danger" onClick={handleBulkDelete}>
                        Delete ({selectedIds.size})
                    </button>
                )}
            </div>

            {/* ── Summary Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Amount Paid', value: totalAmountPaid, color: 'var(--muted-text)' },
                    { label: 'Landed Cost', value: totalLandedCost, color: 'var(--muted-text)' },
                    { label: 'Total Gain', value: totalGain, color: 'var(--success)' },
                    { label: 'Total Loss', value: totalLoss, color: 'var(--danger)' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{
                        background: 'var(--panel-solid)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem'
                    }}>
                        <p className="muted" style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</p>
                        <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '1.1rem', color }}>{formatCurrency(value)}</p>
                    </div>
                ))}
            </div>

            <Panel title="Transactions">
                {loading ? (
                    <EmptyState title="Loading…" description="Fetching foreign currency transactions." />
                ) : filtered.length === 0 ? (
                    <EmptyState title="No transactions" description="Add a foreign currency transaction to get started." />
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 36 }}>
                                        <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                                            onChange={toggleSelectAll} />
                                    </th>
                                    <th>Date</th>
                                    <th>Voucher No.</th>
                                    <th>Supplier Name</th>
                                    <th className="text-right">Amount Paid</th>
                                    <th className="text-right">Landed Cost</th>
                                    <th className="text-right" style={{ color: 'var(--danger)' }}>Loss</th>
                                    <th className="text-right" style={{ color: 'var(--success)' }}>Gain</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(t => (
                                    <tr key={t.id} className={selectedIds.has(t.id) ? 'selected' : ''}>
                                        <td><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} /></td>
                                        <td>{formatDateShort(t.date)}</td>
                                        <td>{t.voucherNo || <span className="muted">—</span>}</td>
                                        <td>{t.supplierName}</td>
                                        <td className="text-right">{formatCurrency(t.amountPaid)}</td>
                                        <td className="text-right">{formatCurrency(t.landedCost)}</td>
                                        <td className="text-right" style={{ color: t.loss > 0 ? 'var(--danger)' : 'inherit' }}>
                                            {t.loss > 0 ? formatCurrency(t.loss) : <span className="muted">—</span>}
                                        </td>
                                        <td className="text-right" style={{ color: t.gain > 0 ? 'var(--success)' : 'inherit' }}>
                                            {t.gain > 0 ? formatCurrency(t.gain) : <span className="muted">—</span>}
                                        </td>
                                        <td>
                                            <div className="action-group">
                                                <button className="button secondary small" onClick={() => openEdit(t)}>Edit</button>
                                                <button className="button danger small" onClick={() => handleDelete(t.id)}>Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-strong)' }}>
                                    <td colSpan={4} style={{ paddingTop: '0.75rem' }}>Totals</td>
                                    <td className="text-right">{formatCurrency(totalAmountPaid)}</td>
                                    <td className="text-right">{formatCurrency(totalLandedCost)}</td>
                                    <td className="text-right" style={{ color: 'var(--danger)' }}>{formatCurrency(totalLoss)}</td>
                                    <td className="text-right" style={{ color: 'var(--success)' }}>{formatCurrency(totalGain)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </Panel>

            {/* ── Add/Edit Modal ── */}
            {isModalOpen && (
                <div className="modal-backdrop">
                    <div className="modal-box" style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{form.id ? 'Edit Transaction' : 'Add Transaction'}</h3>
                            <button className="modal-close" type="button" onClick={closeModal}>✕</button>
                        </div>

                        <div className="stack" style={{ gap: '1rem', marginTop: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <label className="label-group">
                                    <span>Date</span>
                                    <input className="input" type="date" value={form.date}
                                        onChange={e => setForm({ ...form, date: e.target.value })} />
                                </label>
                                <label className="label-group">
                                    <span>Company</span>
                                    <select className="select" value={form.companyName}
                                        onChange={e => setForm({ ...form, companyName: e.target.value })}>
                                        {companyNames.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </label>
                            </div>
                            <label className="label-group">
                                <span>Voucher No.</span>
                                <input className="input" type="text" placeholder="e.g. 12926001"
                                    value={form.voucherNo}
                                    onChange={e => setForm({ ...form, voucherNo: e.target.value })} />
                            </label>
                            <label className="label-group">
                                <span>Supplier Name <span style={{ color: 'var(--danger)' }}>*</span></span>
                                <input className="input" type="text" placeholder="e.g. SCHILLS / LEVY"
                                    value={form.supplierName}
                                    onChange={e => setForm({ ...form, supplierName: e.target.value })} />
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <label className="label-group">
                                    <span>Amount Paid (₱)</span>
                                    <input className="input" type="number" step="0.01" placeholder="0.00"
                                        value={form.amountPaid}
                                        onChange={e => setForm({ ...form, amountPaid: e.target.value })} />
                                </label>
                                <label className="label-group">
                                    <span>Landed Cost (₱)</span>
                                    <input className="input" type="number" step="0.01" placeholder="0.00"
                                        value={form.landedCost}
                                        onChange={e => setForm({ ...form, landedCost: e.target.value })} />
                                </label>
                            </div>

                            {/* Live preview */}
                            {(previewAmt > 0 || previewLand > 0) && (
                                <div style={{
                                    borderRadius: 'var(--radius-md)',
                                    padding: '0.75rem 1rem',
                                    background: previewGain > 0 ? 'rgba(34,197,94,.08)' : previewLoss > 0 ? 'rgba(239,68,68,.08)' : 'var(--surface)',
                                    border: `1px solid ${previewGain > 0 ? 'rgba(34,197,94,.3)' : previewLoss > 0 ? 'rgba(239,68,68,.3)' : 'var(--border)'}`,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    {previewGain > 0 && (
                                        <><span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Gain on Foreign Currency Transaction</span>
                                            <strong style={{ color: 'var(--success)' }}>{formatCurrency(previewGain)}</strong></>
                                    )}
                                    {previewLoss > 0 && (
                                        <><span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Loss on Foreign Currency Transaction</span>
                                            <strong style={{ color: 'var(--danger)' }}>{formatCurrency(previewLoss)}</strong></>
                                    )}
                                    {previewDiff === 0 && previewAmt > 0 && (
                                        <span className="muted">No gain or loss (breakeven)</span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
                            <button className="button primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving…' : form.id ? 'Update' : 'Add Transaction'}
                            </button>
                            <button className="button secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ReportsTab({ api, flash, filters, setFilters, isClientMode }) {

    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.reports.getFinancialStatement(filters);
            setReport(data);
        } catch (error) {
            flash(error.message || 'Failed to load report', 'danger');
        } finally {
            setLoading(false);
        }
    }, [api, filters, flash]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const handleExport = async () => {
        try {
            const defaultPath = `Financial_Statement_${filters.companyName.replace(/[^a-z0-9]/gi, '_')}_${filters.toDate}.xlsx`;

            if (isClientMode) {
                flash('Generating Financial Statement...', 'neutral');
                const base64Data = await api.reports.exportFinancialStatementExcel({ filters });
                downloadBase64File(base64Data, defaultPath);
                flash('Financial statement exported successfully!', 'success');
            } else {
                const filePath = await api.files.saveDialog({
                    title: 'Export Financial Statement',
                    defaultPath,
                    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
                });

                if (filePath) {
                    await api.reports.exportFinancialStatementExcel({ filePath, filters });
                    flash('Financial statement exported successfully! Click to open.', 'success', { onClick: () => api.app.openPath(filePath) });
                }
            }
        } catch (error) {
            flash(error.message || 'Export failed', 'danger');
        }
    };

    if (loading) {
        return <EmptyState title="Loading report..." description="Generating financial analytics." />;
    }

    if (!report) {
        return (
            <Panel title="Report Error">
                <EmptyState title="Unable to load report" description="There was an error generating the financial statement. Please try again." />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                    <button className="button primary" onClick={loadReport}>Retry</button>
                </div>
            </Panel>
        );
    }

    const fxGain = report?.fxGain || 0;
    const fxLoss = report?.fxLoss || 0;
    const operatingExpenses = roundMoney(report?.totalExpenses || 0);
    const netOperatingIncome = report ? roundMoney((report?.grossProfit || 0) - operatingExpenses) : 0;
    const netIncomeBeforeTax = roundMoney(netOperatingIncome + fxGain - fxLoss);
    const incomeTaxRate = report?.taxSettings?.incomeTaxRate ?? defaultTaxSettings.incomeTaxRate;
    const taxExpense = roundMoney(netIncomeBeforeTax > 0 ? netIncomeBeforeTax * incomeTaxRate : 0);

    return (
        <div className="stack">
            <div className="filter-bar" style={{ marginBottom: '1.5rem' }}>
                <div className="header-title-group" style={{ marginRight: 'auto' }}>
                    <h2 className="panel-title" style={{ fontSize: '1.1rem' }}>Report Period</h2>
                </div>
                <select
                    className="select select-compact"
                    value={filters.companyName}
                    onChange={(e) => setFilters({ ...filters, companyName: e.target.value })}
                >
                    {companyNames.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                    className="input input-compact"
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                />
                <input
                    className="input input-compact"
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                />
                <button className="button primary" onClick={handleExport}>Export Excel</button>
            </div>

            <Panel title="Financial Statement" subtitle={`Calculated from ${formatDateShort(filters.fromDate)} to ${formatDateShort(filters.toDate)}`}>
                <div className="report-container" style={{
                    background: 'var(--panel-solid)',
                    padding: '40px',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid var(--border)',
                    fontFamily: 'monospace'
                }}>
                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{filters.companyName}</h3>
                        <p className="muted" style={{ margin: 0 }}>Financial Statement</p>
                    </div>

                    <div className="report-row bold" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>Sales</span>
                        <span>{formatCurrency(report?.totalSales || 0)}</span>
                    </div>
                    <div className="report-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: 'var(--muted)' }}>
                        <span>Less: Cost of Goods Sold</span>
                        <span>{formatCurrency(report?.totalCogs || 0)}</span>
                    </div>
                    <div className="report-row bold" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontSize: '1.1rem', color: 'var(--primary-strong)' }}>
                        <span>Gross Profit</span>
                        <span>{formatCurrency(report?.grossProfit || 0)}</span>
                    </div>

                    <div style={{ marginTop: '24px', marginBottom: '8px' }}>
                        <strong className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operating Expenses</strong>
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '12px' }}>
                        {expenseCategories.filter(cat => cat !== 'Other / Gain (Loss) on Foreign Exchange' && cat !== 'Materials & Supplies').map(cat => (
                            <div key={cat} className="report-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dotted var(--border)' }}>
                                <span>{cat}</span>
                                <span>{formatCurrency(report?.expenses?.[cat] || 0)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="report-row bold" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: '8px' }}>
                        <span>Total Expenses</span>
                        <span>{formatCurrency(operatingExpenses)}</span>
                    </div>

                    <div className="report-row bold" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', marginTop: '16px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                        <span>NET Operating Income</span>
                        <span>{formatCurrency(netOperatingIncome)}</span>
                    </div>

                    <div className="report-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginTop: '8px', color: 'var(--success)' }}>
                        <span>Add: Gain on foreign Currency Transaction</span>
                        <span>{formatCurrency(fxGain)}</span>
                    </div>
                    <div className="report-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: 'var(--danger)' }}>
                        <span>Less: Loss on Foreign Currency Transaction</span>
                        <span>{formatCurrency(fxLoss)}</span>
                    </div>

                    <div className="report-row bold" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', marginTop: '8px', fontSize: '1.1rem' }}>
                        <span>Net Income Before Tax</span>
                        <span>{formatCurrency(netIncomeBeforeTax)}</span>
                    </div>

                    <div className="report-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: 'var(--muted)' }}>
                        <span>Less: Income Tax Expense ({roundMoney(incomeTaxRate * 100)}%)</span>
                        <span>{formatCurrency(taxExpense)}</span>
                    </div>

                    <div className="report-row bold" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '20px 0',
                        marginTop: '16px',
                        fontSize: '1.3rem',
                        color: 'var(--success)',
                        borderTop: '2px solid var(--border-strong)'
                    }}>
                        <span>NET INCOME</span>
                        <span>{formatCurrency(netIncomeBeforeTax - taxExpense)}</span>
                    </div>
                </div>
            </Panel>
        </div>
    );
}

function SettingsTab({
    meta,
    taxSettings,
    onSaveTaxSettings,
    onExportFull,
    onImportFull,
    serverInfo,
    connectionStatus,
    remoteHostUrl,
    setRemoteHostUrl,
    onToggleServer,
    onConnectRemote,
    onDisconnectRemote
}) {
    const [taxForm, setTaxForm] = useState(() => ({
        vatRate: String(roundMoney((taxSettings?.vatRate ?? defaultTaxSettings.vatRate) * 100)),
        incomeTaxRate: String(roundMoney((taxSettings?.incomeTaxRate ?? defaultTaxSettings.incomeTaxRate) * 100))
    }));
    const [savingTax, setSavingTax] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState('');

    useEffect(() => {
        if (serverInfo.running && serverInfo.ip) {
            const url = `http://${serverInfo.ip}:${serverInfo.port}`;
            QRCode.toDataURL(url, { width: 256, margin: 2 }, (err, dataUrl) => {
                if (err) {
                    console.error('Failed to generate QR code:', err);
                    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`);
                } else {
                    setQrCodeUrl(dataUrl);
                }
            });
        } else {
            setQrCodeUrl('');
        }
    }, [serverInfo]);

    useEffect(() => {
        setTaxForm({
            vatRate: String(roundMoney((taxSettings?.vatRate ?? defaultTaxSettings.vatRate) * 100)),
            incomeTaxRate: String(roundMoney((taxSettings?.incomeTaxRate ?? defaultTaxSettings.incomeTaxRate) * 100))
        });
    }, [taxSettings]);

    async function handleTaxSubmit(event) {
        event.preventDefault();
        setSavingTax(true);
        try {
            await onSaveTaxSettings({
                vatRate: toNumber(taxForm.vatRate) / 100,
                incomeTaxRate: toNumber(taxForm.incomeTaxRate) / 100
            });
        } finally {
            setSavingTax(false);
        }
    }

    if (connectionStatus.isClientMode) {
        return (
            <div className="settings-console">
                <section className="settings-board">
                    <div className="settings-board-head">
                        <h2><span aria-hidden="true">::</span> Workspace Settings</h2>
                    </div>
                    <div className="settings-accordion-grid">
                        <div className="settings-accordion-card open" style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-bg)' }}>
                                <strong style={{ fontSize: '1rem' }}>Full Database Backup</strong>
                            </div>
                            <div className="settings-accordion-body single" style={{ display: 'block', padding: '1.25rem', borderTop: '1px solid var(--border)' }}>
                                <p className="row-note" style={{ marginBottom: '1rem' }}>Includes all categories below. Pictures are supported in the Excel file.</p>
                                <div className="settings-row-actions">
                                    <button className="button primary" type="button" onClick={onExportFull}>Export Excel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <form className="settings-console" onSubmit={handleTaxSubmit}>
            <section className="settings-board">
                <div className="settings-board-head">
                    <h2><span aria-hidden="true">%</span> Workspace Settings</h2>
                </div>

                <div className="settings-accordion-grid">
                    <details className="settings-accordion-card">
                        <summary>
                            <span>Tax Rates</span>
                            <b aria-hidden="true">v</b>
                        </summary>
                        <div className="settings-accordion-body">
                            <label className="field">
                                <span>VAT (%)</span>
                                <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={taxForm.vatRate}
                                    onChange={(event) => setTaxForm({ ...taxForm, vatRate: event.target.value })}
                                />
                            </label>
                            <label className="field">
                                <span>Income Tax Expense (%)</span>
                                <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={taxForm.incomeTaxRate}
                                    onChange={(event) => setTaxForm({ ...taxForm, incomeTaxRate: event.target.value })}
                                />
                            </label>
                        </div>
                    </details>

                    <details className="settings-accordion-card">
                        <summary>
                            <span>System Information</span>
                            <b aria-hidden="true">v</b>
                        </summary>
                        <div className="settings-info-grid">
                            <div>
                                <small>App Version</small>
                                <strong>{meta?.version || '0.1.0'}</strong>
                            </div>
                            <div>
                                <small>Environment</small>
                                <strong>{meta?.env || 'Production'}</strong>
                            </div>
                        </div>
                    </details>

                    <details className="settings-accordion-card">
                        <summary>
                            <span>Mobile Connection & Local Cloud</span>
                            <b aria-hidden="true">v</b>
                        </summary>
                        <div className="settings-accordion-body single">
                            <div className="stack" style={{ gap: '1.5rem' }}>
                                {/* Local Cloud Server Info */}
                                <div className="stack" style={{ gap: '1rem', padding: '1.5rem', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div className="stack" style={{ gap: '2px' }}>
                                            <strong style={{ fontSize: '0.95rem', color: 'var(--primary-strong)' }}>LOCAL PRIVATE CLOUD SERVER</strong>
                                            <span className="muted" style={{ fontSize: '0.8rem' }}>
                                                Serve inventory, catalog, and sales to other devices on your shop's WiFi network.
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {serverInfo.running && (
                                                <span className="pulse-dot" style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: '#2ecc71',
                                                    boxShadow: '0 0 6px #2ecc71',
                                                    display: 'inline-block'
                                                }}></span>
                                            )}
                                            <Pill tone={serverInfo.running ? 'success' : 'neutral'}>
                                                {serverInfo.running ? 'Running' : 'Stopped'}
                                            </Pill>
                                        </div>
                                    </div>

                                    {serverInfo.running && (
                                        <div className="stack" style={{ gap: '16px', marginTop: '4px' }}>
                                            {/* Link Row */}
                                            <div style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '12px',
                                                padding: '12px',
                                                background: 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px'
                                            }}>
                                                <div className="stack" style={{ gap: '2px' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shop Connection Link</span>
                                                    <code style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary-strong)' }}>
                                                        {`http://${serverInfo.ip}:${serverInfo.port}`}
                                                    </code>
                                                </div>
                                                <button
                                                    className="button secondary"
                                                    type="button"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(`http://${serverInfo.ip}:${serverInfo.port}`);
                                                        flash('Link copied to clipboard!', 'success');
                                                    }}
                                                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                >
                                                    Copy Link
                                                </button>
                                            </div>

                                            {/* QR Code Segment */}
                                            {qrCodeUrl && (
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    padding: '16px',
                                                    background: 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '8px',
                                                    textAlign: 'center'
                                                }}>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted)' }}>
                                                        📷 SCAN WITH MOBILE OR TABLET CAMERA
                                                    </span>
                                                    <div style={{
                                                        padding: '12px',
                                                        background: '#ffffff',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border)',
                                                        boxShadow: 'var(--shadow-sm)',
                                                        display: 'inline-flex'
                                                    }}>
                                                        <img src={qrCodeUrl} alt="Scan to connect" style={{ width: '160px', height: '160px', display: 'block' }} />
                                                    </div>
                                                    <p className="muted" style={{ fontSize: '0.78rem', maxWidth: '360px', margin: '0 auto', lineHeight: 1.4 }}>
                                                        Open your phone's camera, scan the QR code, and click the link to start selling and updating stocks instantly!
                                                    </p>
                                                    <small className="muted" style={{ fontSize: '0.72rem' }}>
                                                        Note: Your phone must be connected to the same local WiFi router.
                                                    </small>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                                                <span>Active Remote Phones/Devices:</span>
                                                <strong>{serverInfo.connectedClients || 0}</strong>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                                        <button
                                            className={`button ${serverInfo.running ? 'secondary' : 'primary'}`}
                                            type="button"
                                            onClick={() => onToggleServer(!serverInfo.running)}
                                        >
                                            {serverInfo.running ? 'Stop Host Server' : 'Start Host Server'}
                                        </button>
                                    </div>
                                </div>

                                {/* Collapsed Advanced Remote Database Link Setup */}
                                <details style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <summary className="muted" style={{ fontWeight: 600, padding: '4px 0' }}>
                                        Advanced: Connect to another Host Computer
                                    </summary>
                                    <div className="stack" style={{ gap: '0.5rem', padding: '1rem', background: 'rgba(0,0,0,0.01)', border: '1px dashed var(--border)', borderRadius: '8px', marginTop: '8px', cursor: 'default' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong>Client Mode Status</strong>
                                            <Pill tone={connectionStatus.connected ? 'accent' : 'neutral'}>
                                                {connectionStatus.connected ? 'Linked' : 'Local Only'}
                                            </Pill>
                                        </div>
                                        <p className="muted" style={{ fontSize: '0.78rem' }}>
                                            Allows linking this secondary computer's database directly to your primary shop computer.
                                        </p>

                                        {!connectionStatus.connected ? (
                                            <div className="stack" style={{ gap: '0.5rem', marginTop: '4px' }}>
                                                <label className="field">
                                                    <span>Primary Host IP Address (e.g. 192.168.1.7)</span>
                                                    <input
                                                        className="input"
                                                        placeholder="Enter primary computer's IP"
                                                        value={remoteHostUrl}
                                                        onChange={(e) => setRemoteHostUrl(e.target.value)}
                                                    />
                                                </label>
                                                <button className="button primary" type="button" onClick={onConnectRemote}>
                                                    Connect to Primary PC
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="stack" style={{ gap: '0.5rem', marginTop: '4px' }}>
                                                <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.82rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>Linked to database:</span>
                                                        <code style={{ fontWeight: 600, color: 'var(--accent)' }}>{connectionStatus.url}</code>
                                                    </div>
                                                </div>
                                                <button className="button danger" type="button" onClick={onDisconnectRemote}>
                                                    Disconnect & Use Local SQLite
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </details>
                            </div>
                        </div>
                    </details>

                </div>

                <div className="settings-section-title">
                    <h2><span aria-hidden="true">::</span> Data Management</h2>
                </div>

                <div className="settings-accordion-grid">
                    <details className="settings-accordion-card">
                        <summary>
                            <span>Full Database Backup</span>
                            <b aria-hidden="true">v</b>
                        </summary>
                        <div className="settings-accordion-body single">
                            <p className="row-note">Includes all categories below. Pictures are supported in the Excel file.</p>
                            <div className="settings-row-actions">
                                <button className="button primary" type="button" onClick={onExportFull}>Export Excel</button>
                                <button className="button secondary" type="button" onClick={onImportFull}>Import Excel / CSV</button>
                            </div>
                        </div>
                    </details>

                </div>

                <button className="settings-save-bar" type="submit" disabled={savingTax}>
                    {savingTax ? 'Saving...' : 'Save Changes'}
                </button>
            </section>
        </form>
    );
}

function ReceiptModal({ sale, onClose }) {
    if (!sale) return null;

    const maxRows = 16;
    const items = sale.items || [];
    const rows = [];
    for (let i = 0; i < maxRows; i++) {
        rows.push(items[i] || null);
    }

    const formattedTotal = formatCurrency(sale.grossAmount);

    return (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
            <div className="modal-box receipt-box">
                <div className="receipt-grid">

                    {/* LEFT PANE */}
                    <div className="receipt-pane-left">
                        <div className="receipt-header-left">
                            <img src={logo} alt="Logo" className="receipt-logo" />
                            <h2 className="receipt-company-title">BATANGAS DAIRY FARMTECH INC.</h2>
                        </div>

                        <div className="receipt-sold-to-box">
                            <span className="receipt-box-label">SOLD TO:</span>
                            <span className="receipt-box-value" title={sale.customerName || 'Walk-In Customer'}>
                                {sale.customerName || 'Walk-In Customer'}
                            </span>
                        </div>

                        <table className="receipt-table-left">
                            <thead>
                                <tr>
                                    <th style={{ width: '20%' }}>QTY</th>
                                    <th style={{ width: '20%' }}>UNIT</th>
                                    <th style={{ width: '60%' }}>DESCRIPTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ width: '20%', textAlign: 'center' }}>
                                            {item ? formatQuantity(item.qty) : ''}
                                        </td>
                                        <td style={{ width: '20%', textAlign: 'center' }}>
                                            {item ? item.unit : ''}
                                        </td>
                                        <td style={{
                                            width: '60%',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {item ? item.productName : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="receipt-footer-left">
                            <div className="receipt-total-label-row">
                                TOTAL
                            </div>
                            <div className="receipt-signature-row">
                                <div className="receipt-sig-line"></div>
                                <span className="receipt-sig-sub">CASHIER / AUTHORIZED PERSON</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANE */}
                    <div className="receipt-pane-right">
                        <div className="receipt-header-right">
                            <div className="receipt-invoice-title">INVOICE</div>
                            <div className="receipt-meta-grid">
                                <div className="receipt-meta-cell">
                                    <span>DATE</span>
                                    <strong>{formatDateShort(sale.date)}</strong>
                                </div>
                                <div className="receipt-meta-cell">
                                    <span>INVOICE #</span>
                                    <strong>{sale.receiptNumber ? String(sale.receiptNumber).padStart(5, '0') : 'N/A'}</strong>
                                </div>
                            </div>
                        </div>

                        <div className="receipt-address-box">
                            <span className="receipt-box-label">ADDRESS:</span>
                            <span className="receipt-box-value" title={sale.customerAddress || '-'}>
                                {sale.customerAddress || '-'}
                            </span>
                        </div>

                        <table className="receipt-table-right">
                            <thead>
                                <tr>
                                    <th style={{ width: '45%' }}>PRICE EACH</th>
                                    <th style={{ width: '55%' }}>AMOUNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ width: '45%', textAlign: 'right' }}>
                                            {item ? new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.unitPrice) : ''}
                                        </td>
                                        <td style={{ width: '55%', textAlign: 'right' }}>
                                            {item ? new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.grossAmount) : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="receipt-footer-right">
                            <div className="receipt-total-value-row">
                                {formattedTotal}
                            </div>
                            <div className="receipt-extra-space"></div>
                        </div>
                    </div>

                </div>

                <div className="form-actions" style={{ marginTop: '24px', justifyContent: 'center' }}>
                    <button className="button primary" onClick={() => window.print()}>Print Receipt</button>
                    <button className="button secondary" onClick={onClose}>✕ Close</button>
                </div>
            </div>
        </div>
    );
}

function PurchaseVoucherModal({ purchase, onClose }) {
    if (!purchase) return null;

    const maxRows = 16;
    const items = purchase.items || [];
    const rows = [];
    for (let i = 0; i < maxRows; i++) {
        rows.push(items[i] || null);
    }

    const formattedTotal = formatCurrency(purchase.grossAmount);
    const formattedNetOfVat = formatCurrency(purchase.netOfVat || (purchase.grossAmount - purchase.inputVat));
    const formattedInputVat = formatCurrency(purchase.inputVat);

    return (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
            <div className="modal-box receipt-box">
                <div className="receipt-grid">

                    {/* LEFT PANE */}
                    <div className="receipt-pane-left">
                        <div className="receipt-header-left">
                            <img src={logo} alt="Logo" className="receipt-logo" />
                            <h2 className="receipt-company-title">BATANGAS DAIRY FARMTECH INC.</h2>
                        </div>

                        <div className="receipt-sold-to-box">
                            <span className="receipt-box-label">PAID TO:</span>
                            <span className="receipt-box-value" title={purchase.supplierName || 'Cash Supplier'}>
                                {purchase.supplierName || 'Cash Supplier'}
                            </span>
                        </div>

                        <table className="receipt-table-left">
                            <thead>
                                <tr>
                                    <th style={{ width: '20%' }}>QTY</th>
                                    <th style={{ width: '20%' }}>UNIT</th>
                                    <th style={{ width: '60%' }}>DESCRIPTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ width: '20%', textAlign: 'center' }}>
                                            {item ? formatQuantity(item.qty) : ''}
                                        </td>
                                        <td style={{ width: '20%', textAlign: 'center' }}>
                                            {item ? item.unit : ''}
                                        </td>
                                        <td style={{
                                            width: '60%',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {item ? item.productName : (idx === 0 ? purchase.expenseCategory : '')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="receipt-footer-left">
                            <div className="receipt-total-label-row">
                                TOTAL EXPENDITURE
                            </div>
                            <div className="receipt-signature-row">
                                <div className="receipt-sig-line"></div>
                                <span className="receipt-sig-sub">PAYEE / AUTHORIZED SIGNATURE</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANE */}
                    <div className="receipt-pane-right">
                        <div className="receipt-header-right">
                            <div className="receipt-invoice-title">PAYMENT VOUCHER</div>
                            <div className="receipt-meta-grid">
                                <div className="receipt-meta-cell">
                                    <span>DATE</span>
                                    <strong>{formatDateShort(purchase.date)}</strong>
                                </div>
                                <div className="receipt-meta-cell">
                                    <span>OR / INV #</span>
                                    <strong>{purchase.receiptNumber ? String(purchase.receiptNumber) : 'N/A'}</strong>
                                </div>
                            </div>
                        </div>

                        <div className="receipt-address-box">
                            <span className="receipt-box-label">TIN / ADDRESS:</span>
                            <span className="receipt-box-value" title={`${purchase.supplierTin ? 'TIN: ' + purchase.supplierTin : ''} ${purchase.address || ''}`.trim() || '-'}>
                                {`${purchase.supplierTin ? 'TIN: ' + purchase.supplierTin : ''} ${purchase.address || ''}`.trim() || '-'}
                            </span>
                        </div>

                        <table className="receipt-table-right">
                            <thead>
                                <tr>
                                    <th style={{ width: '45%' }}>UNIT COST</th>
                                    <th style={{ width: '55%' }}>AMOUNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ width: '45%', textAlign: 'right' }}>
                                            {item ? new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.unitCost) : ''}
                                        </td>
                                        <td style={{ width: '55%', textAlign: 'right' }}>
                                            {item ? new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.grossAmount) : (idx === 0 ? new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(purchase.grossAmount) : '')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="receipt-footer-right" style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500 }}>
                                <span>NET OF VAT:</span>
                                <span>{formattedNetOfVat}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500, borderBottom: '1px dashed var(--border)', paddingBottom: '4px' }}>
                                <span>INPUT VAT:</span>
                                <span>{formattedInputVat}</span>
                            </div>
                            <div className="receipt-total-value-row" style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-strong)', marginTop: '4px' }}>
                                {formattedTotal}
                            </div>
                        </div>
                    </div>

                </div>

                <div className="form-actions" style={{ marginTop: '24px', justifyContent: 'center' }}>
                    <button className="button primary" onClick={() => window.print()}>Print Voucher</button>
                    <button className="button secondary" onClick={onClose}>✕ Close</button>
                </div>
            </div>
        </div>
    );
}

function ConfirmDialog({
    title,
    message,
    onConfirm,
    onCancel,
    isOpen,
    confirmText = 'Delete',
    confirmTone = 'danger'
}) {
    const confirmRef = useRef(null);

    useEffect(() => {
        if (isOpen && confirmRef.current) {
            confirmRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="confirm-overlay" style={{ zIndex: 9999 }}>
            <div className="confirm-dialog">
                <h3>{title}</h3>
                <p>{message}</p>
                <div className="confirm-actions">
                    <button
                        ref={confirmRef}
                        className={`button ${confirmTone}`}
                        type="button"
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                    <button
                        className="button secondary"
                        type="button"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

function RestockProductDialog({ product, isOpen, onConfirm, onCancel }) {
    const [quantity, setQuantity] = useState('1');
    const [unitCost, setUnitCost] = useState('0');
    const [srp, setSrp] = useState('0');
    const [date, setDate] = useState(toDateInputValue());
    const [batchNumber, setBatchNumber] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && product) {
            setQuantity('1');
            setUnitCost(String(product.cost || '0'));
            setSrp(String(product.srp || '0'));
            setDate(toDateInputValue());
            setBatchNumber(`RESTOCK-${Date.now()}`);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, product]);

    if (!isOpen || !product) return null;

    const qty = parseFloat(quantity) || 0;
    const cost = parseFloat(unitCost) || 0;
    const srpVal = parseFloat(srp) || 0;
    const isValid = qty > 0 && cost >= 0 && srpVal >= 0 && date;

    function handleSubmit(e) {
        e.preventDefault();
        if (isValid) {
            onConfirm({
                productId: product.id,
                quantity: qty,
                unitCost: cost,
                srp: srpVal,
                date,
                batchNumber
            });
        }
    }

    return (
        <div className="confirm-overlay" style={{ zIndex: 9999 }}>
            <div className="confirm-dialog" style={{ minWidth: '400px' }}>
                <h3>Restock {product.name}</h3>
                <p style={{ marginBottom: '12px', color: '#666', fontSize: '0.9rem' }}>
                    Current stock: <strong>{product.stockQty} {product.unit}</strong>
                </p>
                <form onSubmit={handleSubmit} className="form-stack">
                    <div className="field-grid">
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>Quantity ({product.unit})</span>
                            <input
                                ref={inputRef}
                                className="input"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>Unit Cost</span>
                            <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={unitCost}
                                onChange={(e) => setUnitCost(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>New SRP</span>
                            <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={srp}
                                onChange={(e) => setSrp(e.target.value)}
                            />
                        </label>
                    </div>

                    <div className="field-grid">
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>Restock Date</span>
                            <input
                                className="input"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>Batch Number</span>
                            <input
                                className="input"
                                placeholder="Auto-generated if empty"
                                value={batchNumber}
                                onChange={(e) => setBatchNumber(e.target.value)}
                            />
                        </label>
                    </div>

                    <div className="confirm-actions">
                        <button
                            className="button primary"
                            type="submit"
                            disabled={!isValid}
                        >
                            Confirm Restock
                        </button>
                        <button className="button secondary" type="button" onClick={onCancel}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function SplitProductDialog({ product, isOpen, onConfirm, onCancel }) {
    const [quantity, setQuantity] = useState(1);
    const [laborCost, setLaborCost] = useState('0');
    const [packagingCost, setPackagingCost] = useState('0');
    const [srp, setSrp] = useState('0');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && product) {
            setQuantity(1);
            setLaborCost('0');
            setPackagingCost('0');

            const initialSrp = product.pricePerKg > 0
                ? product.pricePerKg
                : (product.sackWeightKg > 0 ? (product.srp / product.sackWeightKg) : 0);

            setSrp(String(initialSrp));
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, product]);

    if (!isOpen || !product) return null;

    const qty = parseFloat(quantity) || 0;
    const lCost = parseFloat(laborCost) || 0;
    const pCost = parseFloat(packagingCost) || 0;
    const addedKg = qty > 0 && product.sackWeightKg > 0 ? (qty * product.sackWeightKg).toFixed(2) : 0;
    const isValid = qty > 0 && qty <= (product.stockQty ?? 0);

    function handleSubmit(e) {
        e.preventDefault();
        if (isValid) onConfirm(qty, lCost, pCost, parseFloat(srp) || 0);
    }

    return (
        <div className="confirm-overlay">
            <div className="confirm-dialog" style={{ minWidth: '400px' }}>
                <h3>Split {product.name}</h3>
                <p style={{ marginBottom: '12px', color: '#666', fontSize: '0.9rem' }}>
                    Available stock: <strong>{product.stockQty} {product.unit}</strong>
                    {product.sackWeightKg > 0 && (
                        <span> · {product.sackWeightKg} kg per {product.unit}</span>
                    )}
                </p>
                <form onSubmit={handleSubmit} className="form-stack">
                    <label className="field" style={{ marginBottom: '12px' }}>
                        <span style={{ fontWeight: 600 }}>Number of {product.unit}s to split</span>
                        <input
                            ref={inputRef}
                            className="input"
                            type="number"
                            min="1"
                            max={product.stockQty ?? 999}
                            step="1"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                    </label>

                    <div className="field-grid">
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>Labor cost (per kg)</span>
                            <input
                                className="input"
                                type="number"
                                value={laborCost}
                                onChange={(e) => setLaborCost(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>Packaging cost (per kg)</span>
                            <input
                                className="input"
                                type="number"
                                value={packagingCost}
                                onChange={(e) => setPackagingCost(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            <span style={{ fontWeight: 600 }}>Retail SRP (per kg)</span>
                            <input
                                className="input"
                                type="number"
                                step="0.01"
                                value={srp}
                                onChange={(e) => setSrp(e.target.value)}
                            />
                        </label>
                    </div>

                    {qty > 0 && product.sackWeightKg > 0 && (
                        <p style={{ marginBottom: '12px', fontSize: '0.88rem', color: '#2d7a3a', fontWeight: 600 }}>
                            → Will add <strong>{addedKg} kg</strong> to retail inventory
                        </p>
                    )}
                    {qty > (product.stockQty ?? 0) && (
                        <p style={{ marginBottom: '8px', fontSize: '0.88rem', color: '#c0392b' }}>
                            ⚠ Exceeds available stock ({product.stockQty} {product.unit})
                        </p>
                    )}
                    <div className="confirm-actions">
                        <button
                            className="button primary"
                            type="submit"
                            disabled={!isValid}
                        >
                            Confirm Split
                        </button>
                        <button className="button secondary" type="button" onClick={onCancel}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}



function downloadBase64File(base64Data, fileName) {
    const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export default function App() {
    const api = typeof window !== 'undefined' ? window.agriLedger : null;


    const [meta, setMeta] = useState(null);
    const [lookups, setLookups] = useState({
        companyNames,
        salesChannels,
        saleStatuses,
        productCategories,
        expenseCategories
    });
    const [taxSettings, setTaxSettings] = useState(defaultTaxSettings);
    const [dashboard, setDashboard] = useState(null);
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [sales, setSales] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [loading, setLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [toasts, setToasts] = useState([]);

    // Network Sync State
    const [serverInfo, setServerInfo] = useState({ running: false, ip: '', port: 3847 });
    const [connectionStatus, setConnectionStatus] = useState({ connected: false, url: null, isClientMode: false });
    const [remoteHostUrl, setRemoteHostUrl] = useState('');

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
        confirmText: 'Delete',
        confirmTone: 'danger',
        isSecondStep: false
    });
    const [receiptSale, setReceiptSale] = useState(null);
    const [receiptPurchase, setReceiptPurchase] = useState(null);
    // Import dialog state
    const [importDialog, setImportDialog] = useState({
        isOpen: false,
        filePath: '',
        sheets: []
    });

    const [splitDialog, setSplitDialog] = useState({ isOpen: false, product: null });

    const [productSearch, setProductSearch] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [supplierSearch, setSupplierSearch] = useState('');
    const [showProductForm, setShowProductForm] = useState(false);
    const [showCustomerForm, setShowCustomerForm] = useState(false);
    const [showSupplierForm, setShowSupplierForm] = useState(false);
    const [pendingSupplierAction, setPendingSupplierAction] = useState(null);
    const [pendingCustomerAction, setPendingCustomerAction] = useState(null);
    const [pendingProductAction, setPendingProductAction] = useState(null);
    const [showSaleForm, setShowSaleForm] = useState(false);
    const [showPurchaseForm, setShowPurchaseForm] = useState(false);
    const [saleFilters, setSaleFilters] = useState({
        search: '',
        status: 'all',
        channel: 'all',
        companyName: 'all',
        fromDate: '',
        toDate: ''
    });
    const [purchaseFilters, setPurchaseFilters] = useState({
        search: '',
        category: 'all',
        companyName: 'all',
        fromDate: '',
        toDate: ''
    });
    const [dashboardFilters, setDashboardFilters] = useState({
        fromDate: '',
        toDate: ''
    });
    const [reportFilters, setReportFilters] = useState({
        fromDate: toDateInputValue(new Date(new Date().getFullYear(), 0, 1)), // Start of year
        toDate: toDateInputValue(),
        companyName: companyNames[0]
    });
    const [productForm, setProductForm] = useState(blankProductForm());
    const [customerForm, setCustomerForm] = useState(blankCustomerForm());
    const [supplierForm, setSupplierForm] = useState(blankSupplierForm());
    const [saleForm, setSaleForm] = useState(blankSaleForm());
    const [purchaseForm, setPurchaseForm] = useState(blankPurchaseForm());
    const [showAdvancedProductFields, setShowAdvancedProductFields] = useState(false);
    const productCodeInputRef = useRef(null);

    useEffect(() => {
        if (showProductForm && productCodeInputRef.current) {
            requestAnimationFrame(() => {
                productCodeInputRef.current?.focus();
            });
        }
    }, [showProductForm]);
    const [loaded, setLoaded] = useState({
        dashboard: false,
        products: false,
        customers: false,
        suppliers: false,
        sales: false,
        purchases: false
    });





    const flash = useCallback((text, tone = 'success', options = {}) => {
        const id = createLocalId('toast');
        setToasts((current) => [...current, { id, text, tone, ...options }]);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((current) => current.filter((t) => t.id !== id));
    }, []);

    useEffect(() => {
        if (!api) {
            return;
        }

        let alive = true;

        async function initNetwork() {
            try {
                const info = await api.sync.getServerInfo();
                const status = api.sync.getConnectionStatus();
                if (alive) {
                    setServerInfo(info);
                    setConnectionStatus(status);
                    if (status.url) setRemoteHostUrl(status.url);
                }
            } catch (err) {
                console.error('Failed to init sync status:', err);
            }
        }

        api.sync.onDataChanged((msg) => {
            console.log('[sync] Data changed:', msg);
            // Reload the current workspace view
            loadWorkspace(true);
            flash(`Data updated from ${msg.channel.split(':')[0]}`, 'info');
        });

        api.sync.onConnectionStatusChange((status) => {
            setConnectionStatus(status);
            if (status.connected) {
                loadWorkspace(true);
            }
        });

        void initNetwork();

        async function loadStatic() {
            try {
                const [metaInfo, lookupInfo, taxInfo] = await Promise.all([
                    api.app.getMeta(),
                    api.lookups.get(),
                    api.settings?.getTax ? api.settings.getTax() : defaultTaxSettings
                ]);
                if (alive) {
                    setMeta(metaInfo);
                    setLookups(lookupInfo);
                    setTaxSettings(taxInfo);
                }
            } catch (error) {
                if (alive) {
                    flash(error.message || 'Failed to load application metadata.', 'error');
                }
            }
        }

        void loadStatic();

        return () => {
            alive = false;
        };
    }, [api]);

    async function loadWorkspace(force = true) {
        if (!api) return;

        if (!force) {
            await loadDashboardData();
            return;
        }

        setLoading(true);
        try {
            const [dashboardData, productData, customerData, salesData, purchaseData, supplierData] = await Promise.all([
                api.dashboard.getOverview(dashboardFilters),
                api.products.list(),
                api.customers.list(),
                api.sales.list(),
                api.purchases.list(),
                api.suppliers?.list ? api.suppliers.list() : Promise.resolve([])
            ]);

            setDashboard(dashboardData);
            setProducts(productData);
            setCustomers(customerData);
            setSales(salesData);
            setPurchases(purchaseData);
            setSuppliers(supplierData);
            setLoaded({ dashboard: true, products: true, customers: true, suppliers: true, sales: true, purchases: true });
        } catch (error) {
            flash(error.message || 'Failed to load workspace.', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveTaxSettings(nextSettings) {
        try {
            const saved = await api.settings.saveTax(nextSettings);
            setTaxSettings(saved);
            setLoaded(prev => ({ ...prev, dashboard: false }));
            flash('Tax settings saved.', 'success');
            await loadWorkspace(true);
        } catch (error) {
            flash(error.message || 'Failed to save tax settings.', 'danger');
            throw error;
        }
    }

    async function loadDashboardData() {
        if (!api) return;
        setLoading(true);
        try {
            const data = await api.dashboard.getOverview(dashboardFilters);
            setDashboard(data);
            setLoaded(prev => ({ ...prev, dashboard: true }));
        } catch (error) {
            flash(error.message || 'Failed to load dashboard.', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function handleToggleServer(enabled) {
        try {
            const nextInfo = await api.sync.toggleServer(enabled);
            setServerInfo(nextInfo);
            flash(enabled ? 'Host server started.' : 'Host server stopped.', 'success');
        } catch (error) {
            flash(error.message || 'Failed to toggle server.', 'danger');
        }
    }

    async function handleConnectRemote() {
        if (!remoteHostUrl.trim()) return;
        setLoading(true);
        try {
            const url = remoteHostUrl.trim().startsWith('http') ? remoteHostUrl.trim() : `http://${remoteHostUrl.trim()}`;
            await api.sync.connectToHost(url);
            flash('Connected to remote host.', 'success');
        } catch (error) {
            flash(error.message || 'Failed to connect to host.', 'danger');
        } finally {
            setLoading(false);
        }
    }

    async function handleDisconnectRemote() {
        try {
            api.sync.disconnectFromHost();
            flash('Disconnected from remote. Using local database.', 'info');
            await loadWorkspace(true);
        } catch (error) {
            flash(error.message || 'Error during disconnect.', 'danger');
        }
    }

    async function loadProductsData(force = false) {
        if (!api || (loaded.products && !force)) return;
        setLoading(true);
        try {
            const data = await api.products.list();
            setProducts(data);
            setLoaded(prev => ({ ...prev, products: true }));
        } catch (error) {
            flash(error.message || 'Failed to load products.', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function loadCustomersData(force = false) {
        if (!api || (loaded.customers && !force)) return;
        setLoading(true);
        try {
            const data = await api.customers.list();
            setCustomers(data);
            setLoaded(prev => ({ ...prev, customers: true }));
        } catch (error) {
            flash(error.message || 'Failed to load customers.', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function loadSalesData(force = false) {
        if (!api || (loaded.sales && !force)) return;
        setLoading(true);
        try {
            const data = await api.sales.list();
            setSales(data);
            setLoaded(prev => ({ ...prev, sales: true }));
        } catch (error) {
            flash(error.message || 'Failed to load sales.', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function loadSuppliersData(force = false) {
        if (!api || (loaded.suppliers && !force)) return;
        setLoading(true);
        try {
            const data = await (api.suppliers?.list ? api.suppliers.list() : Promise.resolve([]));
            setSuppliers(data);
            setLoaded(prev => ({ ...prev, suppliers: true }));
        } catch (error) {
            flash(error.message || 'Failed to load suppliers.', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function loadPurchasesData(force = false) {
        if (!api || (loaded.purchases && !force)) return;
        setLoading(true);
        try {
            const data = await api.purchases.list();
            setPurchases(data);
            setLoaded(prev => ({ ...prev, purchases: true }));
        } catch (error) {
            flash(error.message || 'Failed to load purchases.', 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!api) return;
        switch (activeTab) {
            case 'dashboard': loadDashboardData(); break;
            case 'products': loadProductsData(); break;
            case 'customers': loadCustomersData(); break;
            case 'suppliers': loadSuppliersData(); break;
            case 'sales':
                loadSalesData();
                loadProductsData();
                loadCustomersData();
                break;
            case 'purchases':
                loadPurchasesData();
                loadProductsData();
                loadSuppliersData();
                break;
            case 'reports':
                // ReportsTab handles its own data loading via its own useEffect,
                // but we could trigger a general workspace refresh if needed.
                break;
        }
    }, [api, activeTab]);

    useEffect(() => {
        if (!api) {
            setDashboard(null);
            setProducts([]);
            setCustomers([]);
            setSuppliers([]);
            setSales([]);
            setPurchases([]);
            setProductSearch('');
            setCustomerSearch('');
            setSupplierSearch('');
            setShowProductForm(false);
            setShowCustomerForm(false);
            setShowSupplierForm(false);
            setShowSaleForm(false);
            setShowPurchaseForm(false);
            setSaleFilters({ search: '', status: 'all', channel: 'all', companyName: 'all', fromDate: '', toDate: '' });
            setPurchaseFilters({ search: '', category: 'all', companyName: 'all', fromDate: '', toDate: '' });
            setProductForm(blankProductForm());
            setCustomerForm(blankCustomerForm());
            setSupplierForm(blankSupplierForm());
            setSaleForm(blankSaleForm());
            setPurchaseForm(blankPurchaseForm());
            return;
        }

        void loadWorkspace(false);
    }, [api, dashboardFilters]);

    useEffect(() => {
        function preventScrollOnNumberInputs(e) {
            const target = e.target;
            if (target instanceof HTMLInputElement && target.type === 'number' && document.activeElement === target) {
                e.preventDefault();
            }
        }

        // Handle keyboard events to ensure focus is maintained
        function handleWindowBlur() {
            // When window loses focus, schedule a refocus
            setTimeout(() => {
                const focusableElement = document.querySelector('input:not([type="file"]), textarea, select, button, [tabindex]');
                if (focusableElement instanceof HTMLElement && document.hidden === false) {
                    focusableElement.focus();
                }
            }, 50);
        }

        // Ensure keyboard events reach input fields
        function handleKeyDown(e) {
            const target = e.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
                // If not in an input and a letter/number was pressed, try to focus the first input
                if ((/^[a-zA-Z0-9]$/.test(e.key) || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    const firstInput = document.querySelector('input:not([type="file"]):not([type="hidden"]), textarea');
                    if (firstInput instanceof HTMLElement && document.activeElement !== firstInput) {
                        firstInput.focus();
                        // Simulate the key press on the focused element
                        if (/^[a-zA-Z0-9]$/.test(e.key)) {
                            const inputEvent = new KeyboardEvent('keydown', {
                                key: e.key,
                                code: e.code,
                                keyCode: e.keyCode,
                                which: e.which,
                                bubbles: true,
                                cancelable: true
                            });
                            firstInput.dispatchEvent(inputEvent);
                        }
                    }
                }
            }
        }

        document.addEventListener('wheel', preventScrollOnNumberInputs, { passive: false });
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('wheel', preventScrollOnNumberInputs);
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    async function handleWorkspaceRefresh() {
        const result = await loadWorkspace();
        if (result) {
            flash('Workspace refreshed.', 'success');
        }
    }

    function showConfirmDialog(title, message, onConfirm, confirmText = 'Delete', confirmTone = 'danger') {
        setConfirmDialog({
            isOpen: true,
            title,
            message,
            onConfirm,
            confirmText,
            confirmTone,
            isSecondStep: false
        });
    }

    function closeConfirmDialog() {
        setConfirmDialog({
            isOpen: false,
            title: '',
            message: '',
            onConfirm: null,
            confirmText: 'Delete',
            confirmTone: 'danger',
            isSecondStep: false
        });
    }

    function handleConfirmDialogConfirm() {
        if (!confirmDialog.onConfirm) {
            return;
        }

        if (!confirmDialog.isSecondStep) {
            setConfirmDialog((current) => ({
                ...current,
                title: 'Confirm Delete Again',
                message: 'Please confirm one more time. This delete action will be applied immediately.',
                confirmText: 'Delete Permanently',
                isSecondStep: true
            }));
            return;
        }

        confirmDialog.onConfirm();
    }

    function getProductSaveErrorMessage(error) {
        if (!error) {
            return null;
        }

        const message = String(error.message || error || '').trim();

        if (/UNIQUE constraint failed: products\.code/i.test(message) || /Product code.*already exists/i.test(message)) {
            return 'Product code already exists. Please choose a different product code or edit the existing product.';
        }

        return null;
    }

    async function handleProductSubmit(event) {
        event.preventDefault();

        // Frontend validation
        if (!productForm.code?.trim()) {
            flash('The Product Code is missing. Please provide a code.', 'danger');
            return;
        }
        if (!productForm.name?.trim()) {
            flash('The Product Name is empty. Please provide a name.', 'danger');
            return;
        }
        if (toNumber(productForm.srp) <= 0) {
            flash('The SRP (Selling Price) must be greater than zero.', 'danger');
            return;
        }

        let savedProduct = null;
        const isNewProduct = !productForm.id;

        try {
            const payload = {
                ...productForm,
                category: (productForm.category || '').trim(),
                unit: (productForm.unit || '').trim(),
                average_cost: String(calculateAverageCost(productForm.cost, productForm.labor_cost))
            };

            savedProduct = await api.products.save(payload);




            flash(isNewProduct ? 'Product successfully added to catalog.' : 'Product changes saved.', 'success');
            setProductForm(blankProductForm());
            setShowProductForm(false);
            await loadWorkspace();

            if (pendingProductAction && savedProduct) {
                pendingProductAction(savedProduct);
                setPendingProductAction(null);
            }

            // Aggressively restore focus after submit
            setTimeout(() => {
                window.focus();
                document.body.focus();
                const firstInput = document.querySelector('input:not([type="file"]):not([type="hidden"])');
                if (firstInput instanceof HTMLElement) {
                    firstInput.focus();
                }
            }, 10);
        } catch (error) {
            if (savedProduct && isNewProduct) {
                try {
                    await api.products.delete(savedProduct.id);
                } catch (cleanupError) {
                    console.error('Failed to rollback product after error:', cleanupError);
                }
            }

            const friendlyMessage = getProductSaveErrorMessage(error);
            flash(friendlyMessage || error.message || 'Failed to save product.', 'error');
        }
    }

    async function handleProductDelete(id) {
        showConfirmDialog(
            'Delete Product?',
            'This product will be permanently removed from the catalog.',
            async () => {
                closeConfirmDialog();
                try {
                    await api.products.delete(id);
                    flash('Product deleted.', 'success');
                    // Reset form if the deleted product was being edited
                    if (productForm.id === id) {
                        setProductForm(blankProductForm());
                        setShowProductForm(false);
                    }
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete product.', 'error');
                }
            }
        );
    }

    async function handleProductBulkDelete(ids) {
        showConfirmDialog(
            'Delete Multiple Products?',
            `Are you sure you want to delete ${ids.length} selected products? This action cannot be undone.`,
            async () => {
                closeConfirmDialog();
                try {
                    await api.products.bulkDelete(ids);
                    flash(`${ids.length} products deleted.`, 'success');
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete products.', 'error');
                }
            }
        );
    }

    async function handleProductBulkToggleVisibility(ids, hide) {
        try {
            flash(hide ? 'Hiding selected products...' : 'Unhiding selected products...', 'neutral');
            for (const id of ids) {
                const product = products.find(p => p.id === id);
                if (product) {
                    await api.products.save({
                        ...productToForm(product),
                        is_hidden: hide
                    });
                }
            }
            flash(hide ? `${ids.length} products hidden.` : `${ids.length} products unhidden.`, 'success');
            await loadWorkspace();
        } catch (error) {
            flash(error.message || 'Failed to update products visibility.', 'error');
        }
    }

    async function handleCustomerBulkDelete(ids) {
        showConfirmDialog(
            'Delete Multiple Customers?',
            `Are you sure you want to delete ${ids.length} selected customers? This action cannot be undone.`,
            async () => {
                closeConfirmDialog();
                try {
                    await api.customers.bulkDelete(ids);
                    flash(`${ids.length} customers deleted.`, 'success');
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete customers.', 'error');
                }
            }
        );
    }

    function handleSplitProduct(product) {
        setSplitDialog({ isOpen: true, product });
    }

    function closeSplitDialog() {
        setSplitDialog({ isOpen: false, product: null });
    }

    async function handleConfirmSplit(qty, laborCost, packagingCost, srp) {
        const product = splitDialog.product;
        closeSplitDialog();
        try {
            await api.products.split({
                productId: product.id,
                quantity: qty,
                laborCost,
                packagingCost,
                srp
            });
            flash(`Split ${qty} ${product.unit} â†’ ${(qty * product.sackWeightKg).toFixed(2)} kg added to inventory.`, 'success');
            await loadWorkspace();
        } catch (error) {
            flash(error.message || 'Failed to split product.', 'error');
        }
    }


    function handleReorderProduct(product) {
        const qtyToOrder = Math.max(0, (product.reorderPoint || 0) - (product.stockQty || 0));

        // Initialize a new purchase form with this product's data
        const newPurchase = blankPurchaseForm();
        newPurchase.date = toDateInputValue();
        newPurchase.expense_category = 'Materials & Supplies';
        newPurchase.items = [{
            ...blankPurchaseItem(),
            product_id: product.id,
            product_code: product.code,
            product_name: product.name,
            unit: product.unit,
            quantity: String(qtyToOrder > 0 ? qtyToOrder : 1),
            unit_cost: String(product.cost || 0),
            srp: String(product.srp || 0),
            gross_amount: String(roundMoney((qtyToOrder > 0 ? qtyToOrder : 1) * (product.cost || 0)))
        }];

        setPurchaseForm(newPurchase);
        setActiveTab('purchases');
        setShowPurchaseForm(true);
        flash(`Preparing restock for ${product.name}...`, 'info');
    }

    function handleStartProductForm() {
        setProductForm(blankProductForm());
        setShowProductForm(true);
    }

    function handleEditProduct(product) {
        setProductForm(productToForm(product));
        setShowProductForm(true);
    }

    function handleCancelProductForm() {
        setShowProductForm(false);
        setProductForm(blankProductForm());
        setPendingProductAction(null);
    }

    function handleStartCustomerForm() {
        setCustomerForm(blankCustomerForm());
        setShowCustomerForm(true);
    }

    function handleEditCustomer(customer) {
        setCustomerForm(customerToForm(customer));
        setShowCustomerForm(true);
    }

    function handleCancelCustomerForm() {
        setShowCustomerForm(false);
        setCustomerForm(blankCustomerForm());
    }

    function handleStartSaleForm() {
        setSaleForm(blankSaleForm());
        setShowSaleForm(true);
    }

    function handleCancelSaleForm() {
        setShowSaleForm(false);
        setSaleForm(blankSaleForm());
    }

    async function handleEditSale(sale) {
        try {
            const fullSale = await api.sales.get(sale.id);
            setSaleForm(saleToForm(fullSale));
            setShowSaleForm(true);
        } catch (error) {
            flash(error.message || 'Failed to load sale details for editing.', 'error');
        }
    }

    async function handleExportProducts() {
        await handleGenericExport('Inventory-Report', 'Inventory exported successfully!', api.data.exportProductsExcel);
    }

    async function handleExportSales() {
        await handleGenericExport('Sales-Report', 'Sales exported successfully!', api.data.exportSalesExcel);
    }

    async function handleExportPurchases() {
        await handleGenericExport('Expense-Report', 'Purchases/Expenses exported successfully!', api.data.exportPurchasesExcel);
    }

    async function handleExportCustomers() {
        await handleGenericExport('Customer-List', 'Customers exported successfully!', api.data.exportCustomersExcel);
    }

    async function handleExportFull() {
        await handleGenericExport('Full-Backup', 'Full database exported successfully!', api.data.exportFullExcel);
    }

    async function handleGenericExport(prefix, successMsg, exportFn) {
        try {
            const fileName = `${prefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;

            if (connectionStatus.isClientMode) {
                flash('Generating Excel file...', 'neutral');
                const base64Data = await exportFn({});
                downloadBase64File(base64Data, fileName);
                flash(successMsg, 'success');
            } else {
                const filePath = await api.files.saveDialog({
                    title: `Export ${prefix}`,
                    defaultPath: fileName,
                    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
                });

                if (filePath) {
                    flash('Exporting Excel file...', 'neutral');
                    await exportFn({ filePath });
                    flash(successMsg + ' Click to open.', 'success', { onClick: () => api.app.openPath(filePath) });
                }
            }
        } catch (error) {
            flash(error.message || `Failed to export ${prefix}.`, 'error');
        }
    }

    async function handleImportData(typeLabel = 'data', preferredType = null) {
        // If running in client mode (mobile browser/tablet browser), api.files won't exist
        const isClient = !api || !api.files;

        if (isClient) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.csv';
            input.onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const isExcel = file.name.toLowerCase().endsWith('.xlsx');

                try {
                    if (isExcel) {
                        flash('Uploading and analyzing Excel file...', 'neutral');
                        const reader = new FileReader();
                        reader.onload = async (evt) => {
                            try {
                                const arrayBuffer = evt.target.result;
                                // Convert ArrayBuffer to base64
                                let binary = '';
                                const bytes = new Uint8Array(arrayBuffer);
                                const len = bytes.byteLength;
                                for (let i = 0; i < len; i++) {
                                    binary += String.fromCharCode(bytes[i]);
                                }
                                const base64Data = window.btoa(binary);

                                const sheets = await window.agriLedger.app.analyzeExcel({
                                    fileData: base64Data,
                                    isBufferData: true
                                });

                                setImportDialog({
                                    isOpen: true,
                                    filePath: null,
                                    fileData: base64Data,
                                    sheets: sheets.map(s => ({
                                        ...s,
                                        selected: preferredType ? (s.type === preferredType) : (s.type !== 'UNKNOWN')
                                    }))
                                });
                            } catch (err) {
                                flash(err.message || 'Failed to analyze Excel file.', 'error');
                            }
                        };
                        reader.readAsArrayBuffer(file);
                    } else {
                        flash(`Importing CSV ${typeLabel}...`, 'neutral');
                        const reader = new FileReader();
                        reader.onload = async (evt) => {
                            try {
                                const csvContent = evt.target.result;
                                const count = await window.agriLedger.data.importSalesCsv({ csvContent });
                                flash(`Successfully imported ${count} records!`);
                                loadWorkspace();
                            } catch (err) {
                                flash(err.message || 'Failed to import CSV.', 'error');
                            }
                        };
                        reader.readAsText(file);
                    }
                } catch (err) {
                    flash(err.message || 'Failed to read file.', 'error');
                }
            };
            input.click();
            return;
        }

        try {
            const filePath = await api.files.openDialog({
                title: `Import ${typeLabel}`,
                filters: [
                    { name: 'Excel or CSV', extensions: ['xlsx', 'csv'] },
                    { name: 'Excel Files', extensions: ['xlsx'] },
                    { name: 'CSV Files', extensions: ['csv'] }
                ]
            });

            if (filePath) {
                if (filePath.toLowerCase().endsWith('.xlsx')) {
                    flash('Analyzing Excel file...', 'neutral');
                    const sheets = await api.app.analyzeExcel({ filePath });
                    setImportDialog({
                        isOpen: true,
                        filePath,
                        fileData: null,
                        sheets: sheets.map(s => ({
                            ...s,
                            selected: preferredType ? (s.type === preferredType) : (s.type !== 'UNKNOWN')
                        }))
                    });
                } else {
                    flash(`Importing ${typeLabel}...`, 'neutral');
                    const content = await api.files.read({ filePath });
                    const count = await api.data.importSalesCsv({ csvContent: content });
                    flash(`Successfully imported ${count} records!`);
                    loadWorkspace();
                }
            }
        } catch (error) {
            flash(error.message || `Failed to import ${typeLabel}.`, 'error');
        }
    }

    async function handleConfirmImport() {
        const { filePath, fileData, sheets } = importDialog;
        const selectedSheetNames = sheets.filter(s => s.selected).map(s => s.name);

        if (selectedSheetNames.length === 0) {
            flash('Please select at least one sheet to import.', 'warning');
            return;
        }

        setImportDialog(prev => ({ ...prev, isOpen: false }));
        flash('Importing selected sheets...', 'neutral');

        try {
            let count;
            if (fileData) {
                count = await window.agriLedger.data.importSalesExcel({
                    fileData,
                    selectedSheetNames,
                    isBufferData: true
                });
            } else {
                count = await api.data.importSalesExcel({ filePath, selectedSheetNames });
            }
            flash(`Successfully imported ${count} records from ${selectedSheetNames.length} sheets.`);
            loadWorkspace();
        } catch (error) {
            flash(error.message || 'Failed to import data.', 'error');
        }
    }

    function handleStartPurchaseForm() {
        setPurchaseForm(blankPurchaseForm());
        setShowPurchaseForm(true);
    }

    function handleEditPurchase(purchase) {
        setPurchaseForm(purchaseToForm(purchase));
        setShowPurchaseForm(true);
    }

    function handleCancelPurchaseForm() {
        setShowPurchaseForm(false);
        setPurchaseForm(blankPurchaseForm());
    }

    async function handleProductPhotoUpload(event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            let photoPath = null;
            const filePath = file.path;

            if (filePath) {
                photoPath = await api.products.uploadPhoto(filePath);
            } else {
                const fileData = await file.arrayBuffer();
                photoPath = await api.products.uploadPhotoFile({
                    fileName: file.name,
                    fileData
                });
            }

            setProductForm((current) => ({
                ...current,
                photo_path: photoPath
            }));
            flash('Image uploaded. Save the product to keep the new photo.', 'success');
            event.target.value = '';
        } catch (error) {
            flash(error.message || 'Failed to upload product image.', 'error');
        }
    }

    async function handlePurchaseItemPhotoUpload(index, event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            let photoPath = null;
            const filePath = file.path;

            if (filePath) {
                photoPath = await api.products.uploadPhoto(filePath);
            } else {
                const fileData = await file.arrayBuffer();
                photoPath = await api.products.uploadPhotoFile({
                    fileName: file.name,
                    fileData
                });
            }

            setPurchaseForm((current) => {
                const nextItems = [...(current.items || [])];
                nextItems[index] = { ...nextItems[index], photo_path: photoPath };
                return { ...current, items: nextItems };
            });
            flash('Image uploaded for the new product.', 'success');
            event.target.value = '';
        } catch (error) {
            flash(error.message || 'Failed to upload product image.', 'error');
        }
    }

    async function handleCustomerSubmit(event) {
        event.preventDefault();

        if (!customerForm.name?.trim()) {
            flash('The Customer Name is empty. Please provide a name.', 'danger');
            return;
        }

        try {
            const result = await api.customers.save(customerForm);
            flash(customerForm.id ? 'Customer profile updated.' : 'New customer profile saved.', 'success');

            if (pendingCustomerAction && result) {
                pendingCustomerAction(result);
                setPendingCustomerAction(null);
            }

            setCustomerForm(blankCustomerForm());
            setShowCustomerForm(false);
            await loadWorkspace();

            // Restore focus
            setTimeout(() => {
                window.focus();
                document.body.focus();
                const firstInput = document.querySelector('input:not([type="file"]):not([type="hidden"])');
                if (firstInput instanceof HTMLElement) {
                    firstInput.focus();
                }
            }, 10);
        } catch (error) {
            flash('We couldn\'t save the customer details. Make sure the name is not too long.', 'danger');
        }
    }

    async function handleCustomerDelete(id) {
        showConfirmDialog(
            'Delete Customer?',
            'This customer record will be permanently removed.',
            async () => {
                closeConfirmDialog();
                try {
                    await api.customers.delete(id);
                    flash('Customer deleted.', 'success');
                    // Reset form if the deleted customer was being edited
                    if (customerForm.id === id) {
                        setCustomerForm(blankCustomerForm());
                        setShowCustomerForm(false);
                    }
                    await loadWorkspace();

                    // Restore focus after delete - multiple attempts
                    const restoreFocus = () => {
                        window.focus();
                        document.body.focus();
                        const firstInput = document.querySelector('input:not([type="file"]):not([type="hidden"]), textarea, select');
                        if (firstInput instanceof HTMLElement) {
                            firstInput.focus();
                            firstInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
                        }
                    };

                    restoreFocus();
                    setTimeout(restoreFocus, 5);
                    setTimeout(restoreFocus, 15);
                    setTimeout(restoreFocus, 50);
                } catch (error) {
                    flash(error.message || 'Failed to delete customer.', 'error');
                }
            }
        );
    }

    async function handleViewReceipt(id) {
        try {
            const fullSale = await api.sales.get(id);
            setReceiptSale(fullSale);
        } catch (error) {
            flash(error.message || 'Failed to load receipt data.', 'error');
        }
    }

    function handleStartSupplierForm() {
        setSupplierForm(blankSupplierForm());
        setShowSupplierForm(true);
    }

    function handleEditSupplier(supplier) {
        setSupplierForm(supplierToForm(supplier));
        setShowSupplierForm(true);
    }

    function handleCancelSupplierForm() {
        setShowSupplierForm(false);
        setSupplierForm(blankSupplierForm());
    }

    async function handleSupplierSubmit(event) {
        event.preventDefault();

        if (!supplierForm.name?.trim()) {
            flash('The Supplier Name is empty. Please provide a name.', 'danger');
            return;
        }

        try {
            const result = await api.suppliers.save(supplierForm);
            flash(supplierForm.id ? 'Supplier profile updated.' : 'New supplier profile saved.', 'success');

            if (pendingSupplierAction && result) {
                pendingSupplierAction(result);
                setPendingSupplierAction(null);
            }

            setSupplierForm(blankSupplierForm());
            setShowSupplierForm(false);
            await loadWorkspace();

            setTimeout(() => {
                window.focus();
                document.body.focus();
                const firstInput = document.querySelector('input:not([type="file"]):not([type="hidden"])');
                if (firstInput instanceof HTMLElement) firstInput.focus();
            }, 10);
        } catch (error) {
            flash('We couldn\'t save the supplier details. Make sure the name is not too long.', 'danger');
        }
    }

    async function handleSupplierDelete(id) {
        showConfirmDialog(
            'Delete Supplier?',
            'This supplier record will be permanently removed.',
            async () => {
                closeConfirmDialog();
                try {
                    await api.suppliers.delete(id);
                    flash('Supplier deleted.', 'success');
                    if (supplierForm.id === id) {
                        setSupplierForm(blankSupplierForm());
                        setShowSupplierForm(false);
                    }
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete supplier.', 'error');
                }
            }
        );
    }

    async function handleSupplierBulkDelete(ids) {
        showConfirmDialog(
            'Delete Multiple Suppliers?',
            `Are you sure you want to delete ${ids.length} selected suppliers? This action cannot be undone.`,
            async () => {
                closeConfirmDialog();
                try {
                    await api.suppliers.bulkDelete(ids);
                    flash(`${ids.length} suppliers deleted.`, 'success');
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete suppliers.', 'error');
                }
            }
        );
    }

    async function handleSaleSubmit(event) {
        if (event?.preventDefault) {
            event.preventDefault();
        }

        if (!saleForm.date) {
            flash('The Sale Date is missing.', 'danger');
            return;
        }

        const validItems = saleForm.items.filter((item) => item.product_id);
        if (validItems.length === 0) {
            flash('The Sale has no products. Please add at least one item.', 'danger');
            return;
        }

        const originalSale = saleForm.id ? sales.find(s => s.id === saleForm.id) : null;
        const salePreview = summarizeSalePreview(saleForm.items, products, saleForm.status, taxSettings.vatRate, originalSale?.items);

        // Prevent zero quantity
        const zeroQtyItem = salePreview.lines.find((line) => line.qty <= 0 && saleForm.status !== 'FAILED');
        if (zeroQtyItem) {
            flash(`Quantity for ${zeroQtyItem.productName || 'product'} must be greater than zero.`, 'danger');
            return;
        }

        // Prevent submission if any item exceeds available stock
        const overStockItem = salePreview.lines.find((line) => line.isOverStock);
        if (overStockItem) {
            flash(`Insufficient stock for ${overStockItem.productName}. Only ${formatQuantity(overStockItem.availableStock)} ${overStockItem.unit} available.`, 'danger');
            return;
        }

        try {
            const payload = {
                ...saleForm,
                channel: (saleForm.channel || '').trim(),
                company_name: (saleForm.company_name || '').trim(),
                items: validItems.map((item) => ({
                    product_id: item.product_id,
                    qty: item.qty,
                    unit_price: item.unit_price,
                    unit_cost: item.unit_cost,
                    shipping_fee: item.shipping_fee ? parseFloat(item.shipping_fee) : 0,
                    gross_override: item.gross_override,
                    unit: (item.unit || '').trim(),
                    is_vat_exempt: item.is_vat_exempt
                }))
            };

            await api.sales.save(payload);
            flash('Sale transaction successfully recorded.', 'success');
            const result = await loadWorkspace();
            setSaleForm(blankSaleForm(result?.customerData?.[0]?.id ?? ''));
            setShowSaleForm(false);
            setActiveTab('sales');

            // Restore focus
            setTimeout(() => {
                window.focus();
                document.body.focus();
                const firstInput = document.querySelector('input:not([type="file"]):not([type="hidden"])');
                if (firstInput instanceof HTMLElement) {
                    firstInput.focus();
                }
            }, 10);
        } catch (error) {
            const message = error.message || '';
            if (message.includes('STOCK_ERROR:')) {
                const cleanMsg = message.split('STOCK_ERROR:')[1].trim();
                flash(cleanMsg, 'danger');
            } else {
                flash(message || 'Something went wrong while saving the sale.', 'danger');
            }
        }
    }

    async function handleSaleDelete(id) {
        showConfirmDialog(
            'Delete Transaction?',
            'This will restore any inventory associated with this sale and remove the record.',
            async () => {
                closeConfirmDialog();
                try {
                    await api.sales.delete(id);
                    flash('Transaction deleted.', 'success');
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete transaction.', 'error');
                }
            }
        );
    }

    async function handleSaleBulkDelete(ids) {
        showConfirmDialog(
            'Delete Multiple Transactions?',
            `Are you sure you want to delete ${ids.length} selected transactions? Inventory will be restored for each.`,
            async () => {
                closeConfirmDialog();
                try {
                    await api.sales.bulkDelete(ids);
                    flash(`${ids.length} transactions deleted.`, 'success');
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete transactions.', 'error');
                }
            }
        );
    }

    async function handlePurchaseSubmit(event) {
        if (event && event.preventDefault) event.preventDefault();

        const expense_category = (purchaseForm.expense_category || '').trim();
        const isMaterials = expense_category === 'Materials & Supplies';

        // 1. Filter out empty rows (ghost rows or blank entries) — only relevant for Materials & Supplies
        const items = isMaterials
            ? (purchaseForm.items || []).filter(item =>
                (item.product_name || '').trim() || (item.product_id || '').trim() || (item.product_code || '').trim()
            )
            : [];

        if (!purchaseForm.date) {
            flash('The Purchase Date is missing.', 'danger');
            return;
        }
        if (!purchaseForm.supplier_name?.trim()) {
            flash('The Supplier Name is empty. Please provide a name.', 'danger');
            return;
        }
        if (!purchaseForm.receipt_number?.trim()) {
            flash('The Receipt Number is missing.', 'danger');
            return;
        }

        // Filter valid items for Materials & Supplies
        let validItems = items;
        if (isMaterials) {
            validItems = items.filter(item =>
                (item.product_name?.trim() || item.product_id) &&
                toNumber(item.quantity) > 0
            );

            if (validItems.length === 0) {
                flash('Please add at least one product with a quantity.', 'danger');
                return;
            }

            const unlinkedItem = validItems.find(item => !item.product_id && !item.is_new_product);
            if (unlinkedItem) {
                flash(`You entered "${unlinkedItem.product_name}" but didn't select an existing product or click "Create as new product". Please select an option from the dropdown.`, 'danger');
                return;
            }
        } else {
            if (toNumber(purchaseForm.gross_amount) <= 0) {
                flash('Please enter a valid Gross Amount.', 'danger');
                return;
            }
        }

        const submissionForm = {
            ...purchaseForm,
            expense_category,
            company_name: (purchaseForm.company_name || '').trim(),
            supplier_name: (purchaseForm.supplier_name || '').trim(),
            items: validItems.map(item => ({
                ...item,
                product_name: (item.product_name || '').trim(),
                product_code: (item.product_code || '').trim(),
                category: (item.category || '').trim(),
                unit: (item.unit || '').trim()
            }))
        };

        // Re-apply gross_amount calculation for Materials & Supplies
        if (isMaterials) {
            const totalGross = validItems.reduce((sum, item) => sum + toNumber(item.gross_amount), 0);
            submissionForm.gross_amount = String(roundMoney(totalGross));
        }
        let savedPurchase = null;

        try {
            // 2. Process new products first
            for (let i = 0; i < submissionForm.items.length; i++) {
                const item = submissionForm.items[i];
                if (item.is_new_product) {
                    const newProd = await api.products.save({
                        code: item.product_code || `PROD-${Date.now()}-${i}`,
                        name: item.product_name,
                        description: item.description || `Purchased from ${submissionForm.supplier_name} | Receipt ${submissionForm.receipt_number}`,
                        category: item.category || productCategories[0],
                        unit: item.unit || 'pc',
                        cost: String(toNumber(item.unit_cost)),
                        average_cost: String(toNumber(item.unit_cost)),
                        srp: String(toNumber(item.srp, toNumber(item.unit_cost))),
                        sack_weight_kg: String(toNumber(item.sack_weight_kg)),
                        price_per_kg: String(toNumber(item.price_per_kg)),
                        photo_path: item.photo_path || '',
                        stock_qty: '0', // upsertPurchase will handle the restock
                        is_vat_exempt: Boolean(submissionForm.is_vat_exempt),
                        reorder_point: '10'
                    });
                    submissionForm.items[i].product_id = newProd.id;
                    submissionForm.items[i].is_new_product = false;
                }
            }

            // 3. Save purchase (backend handles multi-item and inventory updates)
            savedPurchase = await api.purchases.save(submissionForm);

            // 4. Auto-save supplier to the Suppliers directory
            //    Upsert by name so repeated purchases from same supplier don't create duplicates
            try {
                const supplierName = submissionForm.supplier_name.trim();
                if (supplierName && api.suppliers?.list && api.suppliers?.save) {
                    const existingList = await api.suppliers.list({ search: supplierName });
                    const existing = existingList.find(
                        s => s.name.toLowerCase() === supplierName.toLowerCase()
                    );
                    if (existing) {
                        // Update TIN and address if they were blank and now have values
                        const needsUpdate =
                            (!existing.tin && submissionForm.supplier_tin) ||
                            (!existing.address && submissionForm.address) ||
                            (!existing.contactNumber && submissionForm.supplier_contact) ||
                            (!existing.category && submissionForm.supplier_category);
                        if (needsUpdate) {
                            await api.suppliers.save({
                                id: existing.id,
                                name: existing.name,
                                tin: existing.tin || submissionForm.supplier_tin || '',
                                address: existing.address || submissionForm.address || '',
                                contact_number: existing.contactNumber || submissionForm.supplier_contact || '',
                                email: existing.email || '',
                                category: existing.category || submissionForm.supplier_category || '',
                                notes: existing.notes || ''
                            });
                        }
                    } else {
                        // New supplier — create it
                        await api.suppliers.save({
                            name: supplierName,
                            tin: submissionForm.supplier_tin || '',
                            address: submissionForm.address || '',
                            contact_number: submissionForm.supplier_contact || '',
                            email: '',
                            category: submissionForm.supplier_category || '',
                            notes: ''
                        });
                    }
                }
            } catch (supplierErr) {
                // Non-fatal — purchase is already saved, just log
                console.warn('Auto-save supplier failed (non-fatal):', supplierErr);
            }

            flash('Purchase record successfully saved.', 'success');
            setPurchaseForm(blankPurchaseForm());
            setShowPurchaseForm(false);
            await loadWorkspace();
            setTimeout(() => {
                window.focus();
                document.body.focus();
                const firstInput = document.querySelector('input:not([type="file"]):not([type="hidden"])');
                if (firstInput instanceof HTMLElement) {
                    firstInput.focus();
                }
            }, 10);
        } catch (error) {
            if (savedPurchase?.id) {
                try {
                    await api.purchases.delete(savedPurchase.id);
                } catch (cleanupError) {
                    console.error('Failed to rollback purchase after error:', cleanupError);
                }
            }
            flash(error.message || 'We couldn\'t save the purchase. Please check your data entry.', 'danger');
        }
    }

    async function handlePurchaseDelete(id) {
        showConfirmDialog(
            'Delete Purchase Record?',
            'This will permanently remove the expense entry.',
            async () => {
                closeConfirmDialog();
                try {
                    await api.purchases.delete(id);
                    flash('Record deleted.', 'success');
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete record.', 'error');
                }
            }
        );
    }

    async function handlePurchaseBulkDelete(ids) {
        showConfirmDialog(
            'Delete Multiple Records?',
            `Are you sure you want to delete ${ids.length} selected records? This action cannot be undone.`,
            async () => {
                closeConfirmDialog();
                try {
                    await api.purchases.bulkDelete(ids);
                    flash(`${ids.length} records deleted.`, 'success');
                    await loadWorkspace();
                } catch (error) {
                    flash(error.message || 'Failed to delete records.', 'error');
                }
            }
        );
    }

    async function handleOpenDataFolder() {
        try {
            await api.app.openDataFolder?.();
        } catch (error) {
            flash(error.message || 'Unable to open the data folder.', 'error');
        }
    }

    if (!api) {
        return (
            <div className="unsupported-screen">
                <h1>AgriLedger</h1>
                <p>This workspace needs to run inside the Electron desktop shell.</p>
            </div>
        );
    }

    const tabMeta = {
        dashboard: {
            title: 'Dashboard',
            subtitle: 'Sales, inventory, VAT, and expense snapshots'
        },
        products: {
            title: 'Products',
            subtitle: 'Catalog, stock, and pricing'
        },
        customers: {
            title: 'Customers',
            subtitle: 'Address book and contact records'
        },
        suppliers: {
            title: 'Suppliers',
            subtitle: 'Vendor directory and contact records'
        },
        sales: {
            title: 'Sales',
            subtitle: 'Transaction entry and register'
        },
        purchases: {
            title: 'Purchases',
            subtitle: 'Expense tracking and VAT totals'
        },
        gainLoss: {
            title: 'Gain/Loss',
            subtitle: 'Foreign currency transaction gain & loss'
        },
        reports: {
            title: 'Reports',
            subtitle: 'Financial statements and business analytics'
        },
        settings: {
            title: 'Settings',
            subtitle: 'Local app information and database details'
        }
    };

    const allProductCategories = useMemo(() => {
        return Array.from(new Set([...productCategories, ...products.map(p => (p.category || '').trim())])).sort().filter(Boolean);
    }, [products]);
    const isCustomCategory = productForm.category && !allProductCategories.includes(productForm.category);
    const defaultUnits = ['pc', 'bag', 'kg', 'box', 'bottle', 'can', 'sack', 'unit', 'set', 'roll'];
    const allProductUnits = useMemo(() => {
        return Array.from(new Set([...defaultUnits, ...products.map(p => (p.unit || '').trim())])).sort().filter(Boolean);
    }, [products]);
    const isCustomUnit = productForm.unit && !allProductUnits.includes(productForm.unit);

    return (
        <>
            {isSidebarOpen ? (
                <div className="sidebar-backdrop open" onClick={() => setIsSidebarOpen(false)}></div>
            ) : null}

            {/* â”€â”€ Modal for Import Sheet Selection â”€â”€ */}
            {importDialog.isOpen && (
                <div className="modal-backdrop">
                    <div className="modal-box">
                        <div className="modal-header">
                            <h3 className="modal-title">Select Sheets to Import</h3>
                            <button className="modal-close" type="button" onClick={() => setImportDialog(prev => ({ ...prev, isOpen: false }))}>✕</button>
                        </div>
                        <p className="muted" style={{ marginBottom: '16px' }}>
                            We found the following sheets in your file. Please select which ones you want to import.
                        </p>
                        <div className="stack" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                            {importDialog.sheets.map((sheet, idx) => (
                                <label key={sheet.name} className="checkbox-field" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
                                    <div className="stack-h">
                                        <input
                                            type="checkbox"
                                            checked={sheet.selected}
                                            onChange={(e) => {
                                                const newSheets = [...importDialog.sheets];
                                                newSheets[idx].selected = e.target.checked;
                                                setImportDialog(prev => ({ ...prev, sheets: newSheets }));
                                            }}
                                        />
                                        <div className="stack" style={{ gap: '2px' }}>
                                            <strong style={{ fontSize: '1rem' }}>{sheet.name}</strong>
                                            <small className="muted">{sheet.type === 'UNKNOWN' ? 'Unrecognized format' : `Identified as ${sheet.type}`}</small>
                                        </div>
                                    </div>
                                    {sheet.type !== 'UNKNOWN' && (
                                        <span className="badge success" style={{ fontSize: '0.7rem' }}>Detected</span>
                                    )}
                                </label>
                            ))}
                        </div>
                        <div className="form-actions" style={{ marginTop: '24px' }}>
                            <button className="button primary" onClick={handleConfirmImport}>
                                Import Selected ({importDialog.sheets.filter(s => s.selected).length})
                            </button>
                            <button className="button secondary" onClick={() => setImportDialog(prev => ({ ...prev, isOpen: false }))}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* â”€â”€ Main App Shell â”€â”€ */}
            <div className="app-shell">
                <div className={`sidebar-backdrop ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)} />
                <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                    <div className="sidebar-brand">
                        <div className="brand-mark">
                            <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div>
                            <strong>{meta?.name ?? 'AgriLedger'}</strong>
                            <span>Local sales and inventory desk</span>
                        </div>
                    </div>

                    <nav className="sidebar-nav">
                        {Object.entries(tabMeta).map(([key, value]) => (
                            <button
                                key={key}
                                className={`nav-button ${activeTab === key ? 'active' : ''}`}
                                type="button"
                                onClick={() => { setActiveTab(key); setIsSidebarOpen(false); }}
                            >
                                <span>{value.title}</span>
                                <small>{value.subtitle}</small>
                            </button>
                        ))}
                    </nav>


                </aside>

                <main className="workspace">
                    <header className="workspace-header">
                        <div className="header-title-group">
                            <button className="button ghost hamburger-menu" type="button" onClick={() => setIsSidebarOpen(true)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="3" y1="12" x2="21" y2="12"></line>
                                    <line x1="3" y1="6" x2="21" y2="6"></line>
                                    <line x1="3" y1="18" x2="21" y2="18"></line>
                                </svg>
                            </button>
                            <div>
                                <p className="eyebrow">Local desktop workspace</p>
                                <h1>{tabMeta[activeTab].title}</h1>
                                <p className="muted">{tabMeta[activeTab].subtitle}</p>
                            </div>
                        </div>
                        <div className="header-actions">
                            <Pill tone="info">{meta?.version ?? '0.5.0'}</Pill>
                        </div>
                    </header>

                    <ToastContainer toasts={toasts} onRemove={removeToast} />
                    {loading ? <div className="loading-strip">Syncing local records from SQLite...</div> : null}

                    {activeTab === 'dashboard' ? (
                        <DashboardTab
                            dashboard={dashboard}
                            meta={meta}
                            filters={dashboardFilters}
                            onFilterChange={setDashboardFilters}
                            onReorderProduct={handleReorderProduct}
                        />
                    ) : null}

                    {activeTab === 'products' ? (
                        <ProductsTab
                            products={products}
                            search={productSearch}
                            setSearch={setProductSearch}
                            onEdit={handleEditProduct}
                            onDelete={handleProductDelete}
                            onBulkDelete={handleProductBulkDelete}
                            onBulkToggleVisibility={handleProductBulkToggleVisibility}
                            onCreateNew={handleStartProductForm}
                            onSplit={handleSplitProduct}
                            onReorderProduct={handleReorderProduct}
                            onExport={handleExportProducts}
                            onImport={() => handleImportData('Products')}
                        />
                    ) : null}

                    {activeTab === 'customers' ? (
                        <CustomersTab
                            customers={customers}
                            search={customerSearch}
                            setSearch={setCustomerSearch}
                            showForm={showCustomerForm}
                            form={customerForm}
                            setForm={setCustomerForm}
                            onSubmit={handleCustomerSubmit}
                            onEdit={handleEditCustomer}
                            onDelete={handleCustomerDelete}
                            onBulkDelete={handleCustomerBulkDelete}
                            onCreateNew={handleStartCustomerForm}
                            onCancel={handleCancelCustomerForm}
                            onExport={handleExportCustomers}
                            onImport={() => handleImportData('Customers')}
                        />
                    ) : null}

                    {activeTab === 'suppliers' ? (
                        <SuppliersTab
                            suppliers={suppliers}
                            search={supplierSearch}
                            setSearch={setSupplierSearch}
                            showForm={showSupplierForm}
                            form={supplierForm}
                            setForm={setSupplierForm}
                            onSubmit={handleSupplierSubmit}
                            onEdit={handleEditSupplier}
                            onDelete={handleSupplierDelete}
                            onBulkDelete={handleSupplierBulkDelete}
                            onCreateNew={handleStartSupplierForm}
                            onCancel={handleCancelSupplierForm}
                        />
                    ) : null}

                    {activeTab === 'sales' ? (
                        <SalesTab
                            sales={sales}
                            products={products}
                            customers={customers}
                            taxSettings={taxSettings}
                            filters={saleFilters}
                            setFilters={setSaleFilters}
                            showForm={showSaleForm}
                            form={saleForm}
                            setForm={setSaleForm}
                            onSubmit={handleSaleSubmit}
                            onEdit={handleEditSale}
                            onDelete={handleSaleDelete}
                            onBulkDelete={handleSaleBulkDelete}
                            onCreateNew={handleStartSaleForm}
                            onCancel={handleCancelSaleForm}
                            onViewReceipt={handleViewReceipt}
                            onExport={handleExportSales}
                            onImport={() => handleImportData('Sales')}
                            onCreateCustomer={async (name) => {
                                setCustomerForm({ ...blankCustomerForm(), name });
                                setShowCustomerForm(true);
                                setPendingCustomerAction(() => (newCustomer) => {
                                    setSaleForm(prev => ({
                                        ...prev,
                                        customer_id: newCustomer.id
                                    }));
                                });
                            }}
                            onCreateProduct={async (index, name) => {
                                const cleanName = name.trim();
                                const codeSuggestion = cleanName
                                    ? cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000)
                                    : 'PRD-' + Math.floor(1000 + Math.random() * 9000);

                                setProductForm({
                                    ...blankProductForm(),
                                    name: cleanName,
                                    code: codeSuggestion
                                });
                                setShowAdvancedProductFields(false);
                                setShowProductForm(true);
                                setPendingProductAction(() => (newProduct) => {
                                    setSaleForm(prev => {
                                        const nextItems = [...prev.items];
                                        const currentItem = nextItems[index];
                                        nextItems[index] = {
                                            ...currentItem,
                                            product_id: newProduct.id,
                                            unit: newProduct.unit || 'pc',
                                            unit_price: String(newProduct.srp || '0'),
                                            unit_cost: String(newProduct.average_cost || newProduct.cost || '0'),
                                            is_vat_exempt: Boolean(newProduct.is_vat_exempt || newProduct.isVatExempt)
                                        };
                                        return {
                                            ...prev,
                                            items: nextItems
                                        };
                                    });
                                });
                            }}
                            onUpdateStatus={async (saleId, newStatus) => {
                                try {
                                    const fullSale = await window.agriLedger.sales.get(saleId);
                                    if (!fullSale) return;
                                    const payload = {
                                        ...fullSale,
                                        status: newStatus,
                                        items: fullSale.items.map(i => ({
                                            product_id: i.productId,
                                            qty: i.qty,
                                            unit_price: i.unitPrice,
                                            unit: i.unit,
                                            is_vat_exempt: i.vatExemptAmount > 0
                                        }))
                                    };
                                    await window.agriLedger.sales.save(payload);
                                    loadWorkspace();
                                    flash('Sale status updated.', 'success');
                                } catch (e) {
                                    flash('Failed to update status', 'danger');
                                }
                            }}
                        />
                    ) : null}

                    {activeTab === 'purchases' ? (
                        <PurchasesTab
                            purchases={purchases}
                            products={products}
                            suppliers={suppliers}
                            taxSettings={taxSettings}
                            filters={purchaseFilters}
                            setFilters={setPurchaseFilters}
                            showForm={showPurchaseForm}
                            form={purchaseForm}
                            setForm={setPurchaseForm}
                            onSubmit={handlePurchaseSubmit}
                            onEdit={handleEditPurchase}
                            onDelete={handlePurchaseDelete}
                            onBulkDelete={handlePurchaseBulkDelete}
                            onCreateNew={handleStartPurchaseForm}
                            onCancel={handleCancelPurchaseForm}
                            onExport={handleExportPurchases}
                            onImport={() => handleImportData('Purchases')}
                            onUploadItemPhoto={handlePurchaseItemPhotoUpload}
                            onViewVoucher={setReceiptPurchase}
                            onCreateSupplier={async (name) => {
                                setSupplierForm({ ...blankSupplierForm(), name, category: purchaseForm.expense_category });
                                setShowSupplierForm(true);
                                setPendingSupplierAction(() => (newSupplier) => {
                                    setPurchaseForm(prev => ({
                                        ...prev,
                                        supplier_name: newSupplier.name,
                                        supplier_tin: newSupplier.tin || '',
                                        address: newSupplier.address || '',
                                        supplier_contact: newSupplier.contactNumber || '',
                                        supplier_category: newSupplier.category || ''
                                    }));
                                });
                            }}
                        />
                    ) : null}



                    {activeTab === 'gainLoss' ? (
                        <GainLossTab
                            api={api}
                            flash={flash}
                            companyNames={companyNames}
                        />
                    ) : null}

                    {activeTab === 'reports' ? (
                        <ReportsTab
                            api={api}
                            flash={flash}
                            filters={reportFilters}
                            setFilters={setReportFilters}
                            isClientMode={connectionStatus.isClientMode}
                        />
                    ) : null}

                    {activeTab === 'settings' ? (
                        <SettingsTab
                            meta={meta}
                            taxSettings={taxSettings}
                            onSaveTaxSettings={handleSaveTaxSettings}
                            onExportFull={handleExportFull}
                            onImportFull={() => handleImportData('Full Database', null)}
                            serverInfo={serverInfo}
                            connectionStatus={connectionStatus}
                            remoteHostUrl={remoteHostUrl}
                            setRemoteHostUrl={setRemoteHostUrl}
                            onToggleServer={handleToggleServer}
                            onConnectRemote={handleConnectRemote}
                            onDisconnectRemote={handleDisconnectRemote}
                        />
                    ) : null}
                </main>
            </div>

            {/* Global Modal Layer (Highest Priority) */}
            <ConfirmDialog
                title={confirmDialog.title}
                message={confirmDialog.message}
                isOpen={confirmDialog.isOpen}
                confirmText={confirmDialog.confirmText}
                confirmTone={confirmDialog.confirmTone}
                onConfirm={handleConfirmDialogConfirm}
                onCancel={closeConfirmDialog}
            />

            <SplitProductDialog
                product={splitDialog.product}
                isOpen={splitDialog.isOpen}
                onConfirm={handleConfirmSplit}
                onCancel={closeSplitDialog}
            />

            <ReceiptModal
                sale={receiptSale}
                onClose={() => setReceiptSale(null)}
            />

            <PurchaseVoucherModal
                purchase={receiptPurchase}
                onClose={() => setReceiptPurchase(null)}
            />

            {showCustomerForm && (
                <div className="modal-backdrop" style={{ zIndex: 9999 }}>
                    <div className="modal-box">
                        <div className="modal-header">
                            <h3 className="modal-title">{customerForm.id ? 'Edit customer' : 'Add customer'}</h3>
                            <button className="modal-close" type="button" onClick={handleCancelCustomerForm} aria-label="Close">✕</button>
                        </div>
                        <form className="form-stack" onSubmit={handleCustomerSubmit}>
                            <div className="field-grid">
                                <label className="field">
                                    <span>Name <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        className="input"
                                        placeholder="Full customer name"
                                        maxLength={100}
                                        value={customerForm.name}
                                        onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                                        autoFocus
                                    />
                                </label>
                                <label className="field">
                                    <span>Contact number (optional)</span>
                                    <input
                                        className="input"
                                        placeholder="Mobile or landline"
                                        maxLength={20}
                                        value={customerForm.contact_number}
                                        onChange={(e) => setCustomerForm({ ...customerForm, contact_number: e.target.value })}
                                    />
                                </label>
                                <label className="field span-2">
                                    <span>Address 1 (optional)</span>
                                    <textarea
                                        className="textarea"
                                        rows="2"
                                        placeholder="Complete delivery address"
                                        maxLength={500}
                                        value={customerForm.address}
                                        onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                                    />
                                </label>
                                <label className="field span-2">
                                    <span>Address 2 (optional)</span>
                                    <textarea
                                        className="textarea"
                                        rows="2"
                                        placeholder="Additional address info (e.g. Landmark, Floor, Suite)"
                                        maxLength={500}
                                        value={customerForm.address_2}
                                        onChange={(e) => setCustomerForm({ ...customerForm, address_2: e.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>Customer username (optional)</span>
                                    <input
                                        className="input"
                                        placeholder="Shopee / FB name"
                                        value={customerForm.customer_username}
                                        onChange={(e) => setCustomerForm({ ...customerForm, customer_username: e.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>TIN (optional)</span>
                                    <input
                                        className="input"
                                        placeholder="Taxpayer ID"
                                        value={customerForm.tin}
                                        onChange={(e) => setCustomerForm({ ...customerForm, tin: e.target.value })}
                                    />
                                </label>
                            </div>
                            <div className="form-actions">
                                <button className="button primary" type="submit">
                                    {customerForm.id ? 'Update customer' : 'Save customer'}
                                </button>
                                <button className="button secondary" type="button" onClick={handleCancelCustomerForm}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showSupplierForm && (
                <div className="modal-backdrop" style={{ zIndex: 9999 }}>
                    <div className="modal-box">
                        <div className="modal-header">
                            <h3 className="modal-title">{supplierForm.id ? 'Edit supplier' : 'Add supplier'}</h3>
                            <button className="modal-close" type="button" onClick={handleCancelSupplierForm} aria-label="Close">✕</button>
                        </div>
                        <form className="form-stack" onSubmit={handleSupplierSubmit}>
                            <div className="field-grid">
                                <label className="field">
                                    <span>Name <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        className="input"
                                        placeholder="Company or supplier name"
                                        maxLength={100}
                                        value={supplierForm.name}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                                        autoFocus
                                    />
                                </label>
                                <label className="field">
                                    <span>Contact number (optional)</span>
                                    <input
                                        className="input"
                                        placeholder="Mobile or landline"
                                        maxLength={20}
                                        value={supplierForm.contact_number}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, contact_number: e.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>Email (optional)</span>
                                    <input
                                        className="input"
                                        type="email"
                                        placeholder="supplier@example.com"
                                        maxLength={100}
                                        value={supplierForm.email}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>TIN (optional)</span>
                                    <input
                                        className="input"
                                        placeholder="Taxpayer ID"
                                        maxLength={30}
                                        value={supplierForm.tin}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, tin: e.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>Category (optional)</span>
                                    <input
                                        className="input"
                                        placeholder="e.g. Raw Materials, Packaging, Services"
                                        maxLength={60}
                                        value={supplierForm.category}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })}
                                    />
                                </label>
                                <label className="field span-2">
                                    <span>Address (optional)</span>
                                    <textarea
                                        className="textarea"
                                        rows="2"
                                        placeholder="Complete business address"
                                        maxLength={500}
                                        value={supplierForm.address}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                                    />
                                </label>
                                <label className="field span-2">
                                    <span>Notes (optional)</span>
                                    <textarea
                                        className="textarea"
                                        rows="2"
                                        placeholder="Any additional notes about this supplier"
                                        maxLength={500}
                                        value={supplierForm.notes}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                                    />
                                </label>
                            </div>
                            <div className="form-actions">
                                <button className="button primary" type="submit">
                                    {supplierForm.id ? 'Update supplier' : 'Save supplier'}
                                </button>
                                <button className="button secondary" type="button" onClick={handleCancelSupplierForm}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showProductForm && (
                <div className="modal-backdrop" style={{ zIndex: 9999 }}>
                    <div className="modal-box">
                        <div className="modal-header">
                            <h3 className="modal-title">{productForm.id ? 'Edit product' : 'Add product'}</h3>
                            <button className="modal-close" type="button" onClick={handleCancelProductForm} aria-label="Close">✕</button>
                        </div>
                        <form className="product-form form-stack" onSubmit={handleProductSubmit}>
                            <div className="field-grid">
                                <label className="field">
                                    <span>Product code <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        ref={productCodeInputRef}
                                        className="input"
                                        placeholder="e.g. PRD001"
                                        maxLength={50}
                                        value={productForm.code}
                                        onChange={(event) => setProductForm({ ...productForm, code: event.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>Product name <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        className="input"
                                        placeholder="e.g. Milk Powder"
                                        maxLength={100}
                                        value={productForm.name}
                                        onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
                                    />
                                </label>
                                <label className="field span-2">
                                    <span>Description (optional)</span>
                                    <textarea
                                        className="textarea"
                                        rows="3"
                                        placeholder="Add extra details here..."
                                        maxLength={500}
                                        value={productForm.description}
                                        onChange={(event) => setProductForm({ ...productForm, description: event.target.value })}
                                    />
                                </label>
                                <div className="field">
                                    <span>Category <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <div className="stack" style={{ gap: '8px' }}>
                                        <select
                                            className="select"
                                            value={isCustomCategory ? 'CUSTOM' : (productForm.category || productCategories[0])}
                                            onChange={(e) => {
                                                if (e.target.value === 'CUSTOM') {
                                                    setProductForm({ ...productForm, category: '' });
                                                } else {
                                                    setProductForm({ ...productForm, category: e.target.value });
                                                }
                                            }}
                                        >
                                            {allProductCategories.map((c) => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                            <option value="CUSTOM">+ Add custom...</option>
                                        </select>
                                        {(isCustomCategory || productForm.category === '' || !allProductCategories.includes(productForm.category)) && (
                                            <input
                                                className="input"
                                                placeholder="Type category name..."
                                                value={productForm.category}
                                                onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="field">
                                    <span>Unit <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <div className="stack" style={{ gap: '8px' }}>
                                        <select
                                            className="select"
                                            value={isCustomUnit ? 'CUSTOM' : (productForm.unit || 'pc')}
                                            onChange={(e) => {
                                                if (e.target.value === 'CUSTOM') {
                                                    setProductForm({ ...productForm, unit: '' });
                                                } else {
                                                    setProductForm({ ...productForm, unit: e.target.value });
                                                }
                                            }}
                                        >
                                            {allProductUnits.map((u) => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                            <option value="CUSTOM">+ Add custom...</option>
                                        </select>
                                        {(isCustomUnit || productForm.unit === '' || !allProductUnits.includes(productForm.unit)) && (
                                            <input
                                                className="input"
                                                placeholder="Type unit name..."
                                                value={productForm.unit}
                                                onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="field-grid">
                                <label className="field">
                                    <span>Cost <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        className="input"
                                        type="number"
                                        value={productForm.cost}
                                        onChange={(event) => setProductForm({ ...productForm, cost: event.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>SRP <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        className="input"
                                        type="number"
                                        value={productForm.srp}
                                        onChange={(event) => setProductForm({ ...productForm, srp: event.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>Stock quantity <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        className="input"
                                        type="number"
                                        value={productForm.stock_qty}
                                        onChange={(event) => setProductForm({ ...productForm, stock_qty: event.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>Reorder point <span style={{ color: 'var(--danger)' }}>*</span></span>
                                    <input
                                        className="input"
                                        type="number"
                                        value={productForm.reorder_point}
                                        onChange={(event) => setProductForm({ ...productForm, reorder_point: event.target.value })}
                                    />
                                </label>
                                <label className="field">
                                    <span>Stock value (Cost × Qty)</span>
                                    <input
                                        className="input"
                                        readOnly
                                        value={formatCurrency((parseFloat(productForm.cost) || 0) * (parseFloat(productForm.stock_qty) || 0))}
                                        style={{ background: '#f8f9fa', fontWeight: 'bold' }}
                                    />
                                </label>
                            </div>
                            <button
                                className="button secondary"
                                type="button"
                                onClick={() => setShowAdvancedProductFields(!showAdvancedProductFields)}
                            >
                                {showAdvancedProductFields ? 'Hide advanced options' : 'Show advanced options'}
                            </button>
                            {showAdvancedProductFields ? (
                                <div className="field-grid">
                                    <label className="field">
                                        <span>Sack weight (kg) (optional)</span>
                                        <input
                                            className="input"
                                            type="number"
                                            value={productForm.sack_weight_kg}
                                            onChange={(event) => setProductForm({ ...productForm, sack_weight_kg: event.target.value })}
                                        />
                                    </label>
                                    <label className="field">
                                        <span>Price per kg (optional)</span>
                                        <input
                                            className="input"
                                            type="number"
                                            value={productForm.price_per_kg}
                                            onChange={(event) => setProductForm({ ...productForm, price_per_kg: event.target.value })}
                                        />
                                    </label>
                                </div>
                            ) : null}
                            <div className="field-grid">
                                <label className="field">
                                    <span>Upload image</span>
                                    <div className="file-upload">
                                        <label className="upload-button">
                                            Choose image
                                            <input
                                                className="file-input"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleProductPhotoUpload}
                                            />
                                        </label>
                                        {productForm.photo_path ? (
                                            <div className="photo-preview">
                                                <img src={window.agriLedger.sync.resolvePhotoUrl(productForm.photo_path)} alt="Preview" />
                                            </div>
                                        ) : (
                                            <span className="muted">No image selected yet</span>
                                        )}
                                    </div>
                                </label>
                                <label className="field checkbox-field compact">
                                    <input
                                        type="checkbox"
                                        checked={productForm.is_vat_exempt}
                                        onChange={(event) => setProductForm({ ...productForm, is_vat_exempt: event.target.checked })}
                                    />
                                    <span>VAT exempt</span>
                                </label>
                                <label className="field checkbox-field compact">
                                    <input
                                        type="checkbox"
                                        checked={productForm.is_hidden}
                                        onChange={(event) => setProductForm({ ...productForm, is_hidden: event.target.checked })}
                                    />
                                    <span>Hide from catalog & search</span>
                                </label>
                            </div>
                            <div className="form-actions">
                                <button className="button primary" type="submit">
                                    {productForm.id ? 'Update product' : 'Save product'}
                                </button>
                                <button className="button secondary" type="button" onClick={handleCancelProductForm}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
