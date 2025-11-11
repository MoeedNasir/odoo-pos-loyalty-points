# -*- coding: utf-8 -*-

from odoo import models, fields, api
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta


class LoyaltyProgram(models.Model):
    _inherit = "loyalty.program"

    points_expiry_date = fields.Datetime(
        string="Points Expiry Date",
        help="When this date is reached, all loyalty points for this program will be set to 0. "
             "Leave empty if points should never expire."
    )

    def expire_loyalty_points(self):
        """
        Expire loyalty points for programs where points_expiry_date has been reached.
        Sets all customer loyalty point balances to 0 for expired programs.
        """
        today = fields.Date.context_today(self)
        expired_programs = self.search([
            ('points_expiry_date', '!=', False),
            ('points_expiry_date', '<=', today),
            ('active', '=', True)
        ])

        if not expired_programs:
            return 0

        loyalty_cards = self.env['loyalty.card'].search([
            ('program_id', 'in', expired_programs.ids)
        ])

        if loyalty_cards:
            loyalty_cards.write({'points': 0})
            # Reset issued values in history
            history_lines = self.env['loyalty.history'].search([
                ('card_id', 'in', loyalty_cards.ids),
                ('issued', '>', 0)
            ])
            if history_lines:
                history_lines.write({'issued': 0})
            return len(loyalty_cards)

    @api.model
    def cron_expire_loyalty_points(self):
        """Cron job for program-level point expiry."""
        return self.expire_loyalty_points()


class LoyaltyCard(models.Model):
    _inherit = "loyalty.card"

    expiration_date = fields.Datetime(
        string="Expiration Date",
        help="The date and time when this loyalty card's points expire."
    )

    def _update_expiration_date(self):
        """
        Update expiration date to 6 months from now when points are added.
        Includes time (datetime).
        """
        now = fields.Datetime.now()
        for card in self:
            if card.points > 0:
                card.expiration_date = now + relativedelta(months=6)
            elif card.points <= 0 and not card.expiration_date:
                card.expiration_date = False

    def _expire_card_points(self):
        """
        Expire points for this card when expiration_date <= now.
        Resets card.points and issued values in history.
        """
        now = fields.Datetime.now()
        expired_cards = self.search([
            ('expiration_date', '!=', False),
            ('expiration_date', '<=', now),
            ('points', '>', 0)
        ])
        if not expired_cards:
            return 0

        # Reset points and issued history
        for card in expired_cards:
            card.points = 0
            # Correct model reference
            history_lines = self.env['loyalty.history'].search([
                ('card_id', '=', card.id),
                ('issued', '>', 0)
            ])
            if history_lines:
                history_lines.write({'issued': 0})

        return len(expired_cards)

    @api.model
    def cron_expire_loyalty_cards(self):
        """Cron job to expire loyalty cards daily."""
        return self._expire_card_points()

    @api.model
    def create(self, vals):
        """Override create to set expiration datetime for new cards."""
        record = super().create(vals)
        if record.points > 0:
            record._update_expiration_date()
        return record

    def write(self, vals):
        """Override write to update expiration date when points change."""
        result = super().write(vals)
        if 'points' in vals:
            self._update_expiration_date()
        return result
