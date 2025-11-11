# -*- coding: utf-8 -*-

from odoo import models, fields, api
from datetime import date, datetime
from dateutil.relativedelta import relativedelta


class PosOrder(models.Model):
    _inherit = "pos.order"

    def _update_loyalty_card_expiration(self, loyalty_cards):
        """
        Update expiration dates for loyalty cards after POS order
        """
        for card in loyalty_cards:
            if card.points > 0:
                # Set expiration to 6 months from order date
                order_date = fields.Date.from_string(self.date_order) if self.date_order else date.today()
                order_datetime = datetime.combine(order_date, datetime.now().time())
                card.expiration_date = order_datetime + relativedelta(months=6)

    @api.model
    def _order_fields(self, ui_order):
        """Override to handle loyalty card expiration dates"""
        order_fields = super(PosOrder, self)._order_fields(ui_order)

        # Process loyalty points and update expiration dates
        if ui_order.get('loyalty_points', 0) > 0:
            # Get the partner's loyalty cards
            partner_id = ui_order.get('partner_id')
            if partner_id:
                loyalty_cards = self.env['loyalty.card'].search([
                    ('partner_id', '=', partner_id),
                    ('points', '>', 0)
                ])
                self._update_loyalty_card_expiration(loyalty_cards)

        return order_fields

    def action_pos_order_paid(self):
        """Override to handle expiration dates after payment"""
        result = super(PosOrder, self).action_pos_order_paid()

        # Update loyalty card expiration dates
        for order in self:
            if order.partner_id:
                loyalty_cards = self.env['loyalty.card'].search([
                    ('partner_id', '=', order.partner_id.id),
                    ('points', '>', 0)
                ])
                self._update_loyalty_card_expiration(loyalty_cards)

        return result

    # This model is mainly for backend if needed
    # The main logic is in JavaScript

