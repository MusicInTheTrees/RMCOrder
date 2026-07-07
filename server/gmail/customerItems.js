function itemsForCustomer(lineItems, email) {
  if (!email) return [];
  const key = email.toLowerCase();
  return (lineItems || []).filter(li => (li.customerEmail || '').toLowerCase() === key);
}

function sampleItems(lineItems) {
  const items = lineItems || [];
  const firstLinked = items.find(li => li.customerEmail);
  if (firstLinked) return itemsForCustomer(items, firstLinked.customerEmail);
  return items.slice(0, 2);
}

module.exports = { itemsForCustomer, sampleItems };
