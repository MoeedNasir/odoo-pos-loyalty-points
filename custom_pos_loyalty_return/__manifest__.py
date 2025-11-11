# -*- coding: utf-8 -*-
{
    "name": "Custom POS Loyalty Return Points",
    "summary": "Deduct loyalty points for returned products in POS",
    "description": """
Custom POS Loyalty Return Points
==================================
This module adds functionality to deduct loyalty points when products are returned in POS.
When a product quantity becomes negative (return), the corresponding loyalty points are deducted.

Features:
- Deducts loyalty points for returned products
- Handles negative quantities in loyalty point calculations
- Works with existing loyalty point rules
    """,
    "author": "TechCog",
    "website": "https://www.yourcompany.com",
    "category": "Point of Sale",
    "version": "0.1",
    "depends": ["base", "point_of_sale", "pos_loyalty", "loyalty"],
    "data": [
        "security/ir.model.access.csv",
        "data/ir_cron.xml",
        "views/views.xml",
        "views/templates.xml",
    ],
    "assets": {
        "point_of_sale._assets_pos": [
            "custom_pos_loyalty_return/static/src/js/loyalty_return_patch.js",
        ],
    },
    "demo": [
        "demo/demo.xml",
    ],
    "license": "LGPL-3",
}

