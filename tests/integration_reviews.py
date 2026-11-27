"""Branch/review integration checks. Uses only a disposable gestor_test or barberst_test_* DB.
SQL access is required to move this script's appointments into the past, without changing the clock.
Run with --url, --db-config (mysql client defaults file), --database; optional --fixture-out.
"""
import argparse
import concurrent.futures
import datetime as dt
import json
import re
import subprocess
import uuid
from pathlib import Path
from integration import Client


def run(args):
    assert args.database == 'gestor_test' or re.fullmatch(r'barberst_test_[a-z0-9_]+', args.database), 'Use a disposable test database.'

    def sql(query):
        return subprocess.check_output([
            args.db_client, '--defaults-extra-file=' + str(Path(args.db_config).resolve()),
            '--database=' + args.database, '--batch', '--skip-column-names', '-e', query,
        ], text=True).strip()

    assert sql('SELECT DATABASE();') == args.database
    owner, outsider, customer, stranger, anon = [Client(args.url) for _ in range(5)]
    owner.register('Barber'); outsider.register('Barber'); customer.register('Client'); stranger.register('Client')
    customer_id = customer.call('GET', '/auth/me')['id']
    assert owner.call('GET', '/manage/shops') == []
    customer.call('GET', '/manage/shops', status=403)

    marker = 'Branches-' + uuid.uuid4().hex[:10]
    profile = {'name': marker, 'description': 'Disposable test fixture', 'address': 'Mérida, Yucatán',
               'phone': '9991234567', 'latitude': 20.9674, 'longitude': -89.5926, 'timeZone': 'America/Merida'}
    shop = owner.call('POST', '/manage/shops', profile)['id']
    # Stop before SQL writes unless the API and SQL client demonstrably use the same test DB.
    assert sql(f"SELECT COUNT(*) FROM Shops WHERE Id={int(shop)} AND Name='{marker}';") == '1', 'API/SQL database mismatch.'
    assert len(owner.call('GET', '/manage/shops')) == 1
    owner.call('POST', '/auth/logout', status=204)
    owner.call('POST', '/auth/login', {'email': owner.email, 'password': 'TestPassword1234!'})
    assert owner.call('GET', '/manage/shops')[0]['id'] == shop
    second = owner.call('POST', '/manage/shops', {**profile, 'name': marker + '-B'})['id']
    assert {s['id'] for s in owner.call('GET', '/manage/shops')} == {shop, second}
    assert outsider.call('GET', '/manage/shops') == []
    outsider.call('GET', f'/manage/shops/{shop}/team', status=403)
    outsider.call('GET', f'/bookings?shopId={shop}', status=403)

    barber = owner.call('POST', f'/manage/shops/{shop}/barbers', {'name': 'Reviews Barber', 'active': True})['id']
    cuts = anon.call('GET', '/haircuts')
    offer = owner.call('POST', f'/manage/barbers/{barber}/offerings', {'haircutId': cuts[0]['id'], 'price': 150, 'minutes': 30, 'active': True})['id']
    owner.call('PUT', f'/manage/barbers/{barber}/periods', [{'day': day, 'startMinute': 540, 'endMinute': 720} for day in range(7)], status=204)
    day = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2)).date().isoformat()
    slots = anon.call('GET', f'/offerings/{offer}/slots?date={day}')
    bookings = [customer.call('POST', '/bookings', {'offeringId': offer, 'start': slots[i]['start'], 'items': []})['id'] for i in [0, 2, 4]]
    first, concurrent_booking, cancelled = bookings
    review = {'bookingId': first, 'rating': 5, 'comment': '<script>plain text</script>'}
    anon.call('POST', '/reviews', review, status=400, csrf=False)
    anon.call('POST', '/reviews', review, status=401)
    stranger.call('POST', '/reviews', review, status=403)
    outsider.call('POST', '/reviews', review, status=403)
    customer.call('POST', '/reviews', review, status=409)  # pending
    for rating in [0, 6]:
        customer.call('POST', '/reviews', {**review, 'rating': rating}, status=400)
    customer.call('POST', '/reviews', {**review, 'comment': 'x' * 2001}, status=400)
    owner.call('PUT', f'/bookings/{cancelled}/status', {'status': 'Cancelled'}, status=204)
    customer.call('POST', '/reviews', {**review, 'bookingId': cancelled}, status=409)

    # Completed-but-future fixtures are rejected too. Modify only IDs created by this script.
    owned_ids = ','.join(str(int(value)) for value in [first, concurrent_booking])
    sql(f"UPDATE Bookings SET Status='Completed' WHERE Id IN ({owned_ids}) AND CustomerId={int(customer_id)} AND BarberId={int(barber)};")
    customer.call('POST', '/reviews', review, status=409)
    sql(f"UPDATE Bookings SET StartUtc=UTC_TIMESTAMP()-INTERVAL 2 DAY, EndUtc=UTC_TIMESTAMP()-INTERVAL 1 DAY WHERE Id IN ({owned_ids}) AND CustomerId={int(customer_id)} AND BarberId={int(barber)};")
    customer.call('POST', '/reviews', review, status=201)
    customer.call('POST', '/reviews', review, status=409)
    owner.call('POST', '/reviews', {'bookingId': first, 'rating': 4, 'comment': 'Puntual y respetuoso.'}, status=201)
    owner.call('POST', '/reviews', {'bookingId': first, 'rating': 4}, status=409)

    second_session = Client(args.url)
    second_session.call('POST', '/auth/login', {'email': customer.email, 'password': 'TestPassword1234!'})

    def compete(client):
        try:
            return client.call('POST', '/reviews', {**review, 'bookingId': concurrent_booking, 'rating': 3}, status=201)
        except AssertionError as error:
            assert 'got 409' in str(error), error
            return None

    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results = list(pool.map(compete, [customer, second_session]))
    assert sum(item is not None for item in results) == 1
    public = anon.call('GET', f'/shops/{shop}/reviews')
    assert public['count'] == 2 and public['average'] == 4
    assert all(r['direction'] == 'ClientToShop' for r in public['items'])
    assert any(r['comment'] == review['comment'] for r in public['items'])
    assert all('email' not in r and 'customerId' not in r for r in public['items'])
    assert anon.call('GET', f'/shops/{second}/reviews')['average'] is None
    anon.call('GET', f'/shops/{shop}/reviews?page=0', status=400)
    anon.call('GET', '/shops/2147483647/reviews', status=404)
    assert owner.call('GET', f'/manage/shops/{shop}/reviews')['count'] == 2
    outsider.call('GET', f'/manage/shops/{shop}/reviews', status=403)
    target_path = f'/manage/shops/{shop}/customers/{customer_id}/reviews'
    assert owner.call('GET', target_path)['average'] == 4
    outsider.call('GET', target_path, status=403)
    customer.call('GET', target_path, status=403)
    owner.call('GET', f'/manage/shops/{second}/customers/{customer_id}/reviews', status=404)
    assert customer.call('GET', '/me/reviews')['count'] == 1
    assert stranger.call('GET', '/me/reviews')['count'] == 0
    assert owner.call('GET', f'/bookings?shopId={second}') == []
    rows = owner.call('GET', f'/bookings?shopId={shop}')
    assert len(rows) == 3 and all(b['shopId'] == shop for b in rows)
    completed = next(b for b in rows if b['id'] == first)
    assert completed['clientReviewId'] and completed['shopReviewId']

    if args.fixture_out:
        Path(args.fixture_out).write_text(json.dumps({'ownerEmail': owner.email, 'customerEmail': customer.email,
            'password': 'TestPassword1234!', 'shopId': shop, 'secondShopId': second, 'bookingId': concurrent_booking}))
    print('PASS: 0/1/N owned branches, relogin, branch isolation, bidirectional reviews, completed-only eligibility, validation, duplicate concurrency, privacy and averages')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://localhost:5191')
    parser.add_argument('--db-config', required=True)
    parser.add_argument('--database', default='gestor_test')
    parser.add_argument('--db-client', default='mariadb')
    parser.add_argument('--fixture-out')
    run(parser.parse_args())
