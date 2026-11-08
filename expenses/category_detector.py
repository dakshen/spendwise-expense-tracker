
def detect_category(description):
    text = (description or "").upper()

    rules = {
        "Food & Dining": [
            "SWIGGY", "ZOMATO", "RESTAURANT",
            "FOOD ORDER", "DOMINOS"
        ],
        "Groceries": [
            "BIGBASKET", "DMART", "SUPERMARKET",
            "GROCERY"
        ],
        "Transport": [
            "UBER", "OLA", "RAPIDO", "METRO",
            "FASTAG", "PETROL", "FUEL"
        ],
        "Entertainment": [
            "NETFLIX", "SPOTIFY", "HOTSTAR",
            "PRIME VIDEO"
        ],
        "Shopping": [
            "AMAZON", "FLIPKART", "MYNTRA"
        ],
        "Utilities": [
            "ELECTRICITY", "WATER BILL",
            "BROADBAND", "MOBILE RECHARGE"
        ],
        "Cash Withdrawal": [
            "ATM WDL", "ATM WITHDRAWAL"
        ],
    }

    for category, keywords in rules.items():
        if any(keyword in text for keyword in keywords):
            return category

    return "Other"
