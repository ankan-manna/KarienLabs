# BRENTIS — Final Reference Gap Fix Plan

## Identified Gaps (from side-by-side comparison)

### 1. Shop by Category
| Aspect | Brintoncare (Reference) | BRENTIS (Current) | Fix |
|--------|------------------------|-------------------|-----|
| Desktop layout | 4-column grid, no overflow/peek | Flex scroll with partial 5th card peeking | Switch to `grid-cols-4` on `lg+` |
| Mobile layout | 2×2 grid | 2-col grid ✓ | Already correct |
| Section corners | No rounded corners (full-bleed) | `rounded-[28px]` | Remove rounded corners |
| Arrow buttons | None (static grid) | Edge arrow buttons | Remove arrow buttons |

### 2. Best Sellers
| Aspect | Brintoncare (Reference) | BRENTIS (Current) | Fix |
|--------|------------------------|-------------------|-----|
| Desktop cards | Exactly 4 per row | Flex wrap `calc(25%-15px)` | Switch to `grid-cols-4` |
| Mobile cards | 2 per row in grid | Horizontal scroll, 72% width single cards | Switch to `grid-cols-2` |
| Tab style | Already underlined text ✓ | Already underlined text ✓ | No change needed |
| Section bg | White/no background | `bg-deep-teal` rounded | Remove colored bg, remove rounding |
| "Best Seller" badge | Orange badge below image | Not present | Add `bestSellerBadge` prop to ProductCard |
| View All link | Centered below products | Present ✓ | Already correct |

### 3. Blog Section
| Aspect | Brintoncare (Reference) | BRENTIS (Current) | Fix |
|--------|------------------------|-------------------|-----|
| Card layout | 3-column grid on desktop ✓ | 3-column grid ✓ | Already correct |
| Card content | Image + category tag + title only | Image + tag + title + excerpt + date + "Read article" | Remove excerpt, date, "Read article" |
| Tag style | Plain text (e.g. "Sun Care") | Pill badge with bg | Change to plain text |
| "View All" | "View All Blogs >" centered | "View all articles →" ✓ | Rename to match |

### 4. Timed Interactions
| Aspect | Brintoncare (Reference) | BRENTIS (Current) | Fix |
|--------|------------------------|-------------------|-----|
| Hero auto-advance | ~5-6s interval | 6s (DEFAULT_SLIDE_DURATION_MS) ✓ | Already correct |
| Hero pause-on-hover | Yes | Yes ✓ | Already correct |
| Marquee strip | Continuous scroll | Present ✓ | Already correct |
| Search placeholder cycling | Cycles through categories | Fixed "Search medicines, health products & more" | Add cycling placeholder |

## Files to Modify

1. **`HomePage.tsx`** — CategorySection grid, BestSellers section bg, Blog card simplification
2. **`ProductCard.tsx`** — Add `bestSellerBadge` optional prop
3. **`Header.tsx`** — Add cycling search placeholder

## Implementation Order
1. HomePage.tsx: CategorySection → grid layout
2. HomePage.tsx: BestSellers → remove bg, fix grid
3. HomePage.tsx: Blog → simplify cards
4. ProductCard.tsx → add Best Seller badge
5. Header.tsx → cycling search placeholder
