import React, { useEffect, useState } from 'react';

export function Catalog({ items, query }) {
  const [filtered, setFiltered] = useState([]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const ranked = items
      .filter(item => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q))
      .sort((a, b) => b.popularity - a.popularity)
      .map(item => ({ ...item, label: `${item.name} - ${item.category}` }));
    setFiltered(ranked);
  }, [items, query, filtered]);

  return <ul>{filtered.map(item => <li key={item.id}>{item.label}</li>)}</ul>;
}