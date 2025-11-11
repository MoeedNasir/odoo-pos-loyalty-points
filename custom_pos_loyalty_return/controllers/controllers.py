# -*- coding: utf-8 -*-

from odoo import http
from odoo.http import request


class CustomPosLoyaltyReturnController(http.Controller):
    @http.route('/custom_pos_loyalty_return/health', type='json', auth='user')
    def health(self):
        return {'status': 'ok'}

