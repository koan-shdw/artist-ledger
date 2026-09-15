export const QUERIES = {
  LedgerProducts:
    "query LedgerProducts($after: String) {\n  productVariants(first: 100, after: $after) {\n    nodes { id title sku product { title vendor } inventoryItem { unitCost { amount currencyCode } } }\n    pageInfo { hasNextPage endCursor }\n  }\n}\n",
  LedgerOrders:
    "query LedgerOrders($after: String, $query: String!) {\n  shop { currencyCode ianaTimezone name }\n  orders(first: 50, after: $after, query: $query, sortKey: CREATED_AT) {\n    nodes {\n      id name test displayFinancialStatus cancelledAt\n      lineItems(first: 100) {\n        nodes { id name currentQuantity variant { id } priceAfterAllDiscountsBeforeTaxesSet { shopMoney { amount currencyCode } } }\n        pageInfo { hasNextPage endCursor }\n      }\n      refunds { id refundLineItems(first: 1) { nodes { id } } }\n    }\n    pageInfo { hasNextPage endCursor }\n  }\n}\n",
  LedgerOrderLines:
    "query LedgerOrderLines($id: ID!, $after: String) {\n  order(id: $id) { lineItems(first: 100, after: $after) {\n    nodes { id name currentQuantity variant { id } priceAfterAllDiscountsBeforeTaxesSet { shopMoney { amount currencyCode } } }\n    pageInfo { hasNextPage endCursor }\n  } }\n}\r\n",
  LedgerShop:
    "query LedgerShop { shop { currencyCode ianaTimezone name } currentAppInstallation { accessScopes { handle } } }\r\n\r\n",
};
