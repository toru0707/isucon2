var fs     = require('fs');
var async  = require('async');
var mysql  = require('mysql');
var config = require('../config');
var redis = require("redis");
var client = redis.createClient();

client.on("error", function (err) {
    console.log("Error " + err);
});
function paddingZero(i) {
    if (i < 10) return '0' + i;
    return i + '';
}
// main

exports.index = function (req, res) {
    client.lrange('artists', 0, -1, function(err, results) {
        if (err) { throw err; }
        var artists = [];
        results.forEach(function(e) {
            artists.push(JSON.parse(e));
        });
        res.render('index', { artists: artists });
    });
};

exports.artist = function (req, res) {
    async.series([
        function (callback) {
            client.lrange('artists', req.params.artistid - 1, req.params.artistid, callback);
        },
        function (callback) {
            client.lrange('tickets_' + req.params.artistid, 0, -1, callback);
        }
    ], function (err, results) {
        if (err) { throw err; }
        var artist  = JSON.parse(results[0][0]);
        var tickets = [];
        results[1].forEach(function(str) {
            tickets.push(JSON.parse(str));
        });

        async.map(tickets, function (ticket, callback) {
            client.get('stock_remain_' + ticket.id, callback);
        }, function (err, results) {
            if (err) { throw err; }
            results.forEach(function (e, i) {
                tickets[i].count = e;
            });
            res.render('artist', {
                artist: artist,
                tickets: tickets
            });
        });
    });
};

exports.ticket = function (req, res) {
    async.series([
        function (callback) {
            client.get('ticket_' + req.params.ticketid, callback);
        }
    ], function (err, results) {
        if (err) { throw err; }
console.log(results);
        var ticket = JSON.parse(results[0]);
        async.map(ticket.variation, function (variation, callback) {
            async.series([
                function (callback) {
                    client.lrange('stock_' + variation.id, 0, -1, callback);
                },
                function (callback) {
                    client.get('stock_remain_' + variation.id, callback);
                }
            ], callback);
        }, function (err, results) {
            if (err) { throw err; }
            var variation = ticket.variation;
            results.forEach(function (result, i) {
                var stockList = result[0];
                var remain = result[1];
                variation[i].stock = {};
                stockList.forEach(function (booked, j) {
                    var prefix = paddingZero(parseInt(j / 64));
                    var suffix = paddingZero(j - prefix * 64);
                    var key = prefix + "-" + suffix;
                    variation[i].stock[key] = {
                        order_id: booked == 0 ? null : true
                    };
                  
                });
                variation[i].vacancy = remain;
            });
            client.end();
            res.render('ticket', {
                ticket: ticket,
                variations: variation
            });
        });
    });
};

exports.buy = function (req, res) {
    var variation_id = req.param('variation_id');
    var member_id    = req.param('member_id');
    var client = mysql.createClient(config.database);

    var order_id = undefined;
    async.waterfall([
        function (callback) {
            client.query('BEGIN', callback);
        },
        function (info, callback) {
            client.query(
                'INSERT INTO order_request (member_id) VALUES (?)',
                [ member_id ],
                callback
            );
        },
        function (info, callback) {
            order_id = info.insertId;
            client.query(
                'UPDATE stock SET order_id = ? WHERE variation_id = ? AND order_id IS NULL ORDER BY RAND() LIMIT 1',
                [ order_id, variation_id ],
                callback
            );
        },
        function (info, callback) {
            if (info.affectedRows > 0) {
                client.query(
                    'SELECT seat_id FROM stock WHERE order_id = ? LIMIT 1',
                    [ order_id ],
                    callback
                );
            } else {
                callback('soldout');
            }
        }
    ], function (err, result) {
        if (err) {
            var error = err;
            client.query('ROLLBACK', function (err) {
                if (err) { throw err; }
                client.end();
                if (error === 'soldout') {
                    res.render('soldout');
                } else {
                    throw error;
                }
            });
        } else {
            client.query('COMMIT', function (err) {
                if (err) { throw err; }
                client.end();
                res.render('complete', {
                    seat_id: result[0].seat_id,
                    member_id: member_id
                });
            });
        }
    });
};
