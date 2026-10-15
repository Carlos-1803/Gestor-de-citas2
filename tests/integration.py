"""Integration checks against a disposable, migrated MariaDB/MySQL database.
Run: python tests/integration.py --url http://localhost:5191
Creates isolated users/shops; never run against production.
"""
import argparse
import concurrent.futures
import datetime as dt
import http.cookiejar
import json
import urllib.request
import urllib.error
import uuid

class Client:
    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def call(self, method, path, data=None, status=200, csrf=True, raw=None, content_type=None):
        headers = {}
        if method != 'GET' and csrf:
            token = self.call('GET', '/auth/token')['token']
            headers['X-CSRF-TOKEN'] = token
        if raw is not None:
            body = raw; headers['Content-Type'] = content_type
        else:
            body = json.dumps(data).encode() if data is not None else None
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.base + '/api' + path, data=body, method=method, headers=headers)
        try:
            response = self.http.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        payload = response.read().decode()
        assert response.status == status, f'{method} {path}: expected {status}, got {response.status}: {payload}'
        return json.loads(payload) if payload else None
    def register(self, role):
        suffix = uuid.uuid4().hex[:12]
        self.email = suffix + '@example.test'
        self.call('POST', '/auth/register', {'name': role + ' Test', 'email': self.email, 'password': 'TestPassword1234!', 'role': role})
        assert self.call('GET', '/auth/me')['role'] == role

def run(base):
    owner, other, customer, customer2, anon = [Client(base) for _ in range(5)]
    owner.register('Barber'); other.register('Barber'); customer.register('Client'); customer2.register('Client')
    anon.call('POST', '/auth/register', {}, status=400, csrf=False)
    anon.call('POST', '/auth/register', {'name': 'X', 'email': 'x@example.test', 'password': 'VeryLongPassword!', 'role': 'Admin'}, status=400)
    anon.call('GET', '/bookings', status=401)
    customer.call('POST', '/manage/shops', {}, status=400, csrf=False)
    customer.call('POST', '/manage/shops', {}, status=403)
    cuts = anon.call('GET', '/haircuts'); assert len(cuts) >= 20
    customer.call('POST', '/admin/haircuts', {'name': 'No', 'description': 'No', 'active': True}, status=403)
    profile = {'name': 'Integration ' + uuid.uuid4().hex[:6], 'description': 'Test shop', 'address': 'Mérida, Yucatán', 'phone': '9991234567', 'latitude': 20.9674, 'longitude': -89.5926, 'timeZone': 'America/Merida'}
    shop = owner.call('POST', '/manage/shops', profile)['id']
    other.call('PUT', f'/manage/shops/{shop}', profile, status=403)
    public = anon.call('GET', f'/shops/{shop}')
    assert public['photos'] == [] and public['shop']['latitude'] == profile['latitude']
    barbers = [owner.call('POST', f'/manage/shops/{shop}/barbers', {'name': 'Barber ' + str(i), 'active': True})['id'] for i in range(2)]
    offers = []
    for barber in barbers:
        offers.append(owner.call('POST', f'/manage/barbers/{barber}/offerings', {'haircutId': cuts[0]['id'], 'price': 150, 'minutes': 30, 'active': True})['id'])
        owner.call('PUT', f'/manage/barbers/{barber}/periods', [{'day': d, 'startMinute': 540, 'endMinute': 720} for d in range(7)], status=204)
    owner.call('PUT', f'/manage/barbers/{barbers[0]}/periods', [{'day': 1, 'startMinute': 600, 'endMinute': 800}, {'day': 1, 'startMinute': 700, 'endMinute': 900}], status=400)
    product_body = {'name': 'Pomada', 'description': 'Acabado mate', 'price': 80, 'stock': 3, 'active': True}
    product = owner.call('POST', f'/manage/shops/{shop}/products', product_body)['id']
    other.call('PUT', f'/manage/products/{product}', product_body, status=403)
    date = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2)).date().isoformat()
    slots = anon.call('GET', f'/offerings/{offers[0]}/slots?date={date}')
    assert len(slots) == 11, slots
    start = slots[0]['start']
    def request(offer=offers[0], at=start, quantity=2):
        return {'offeringId': offer, 'start': at, 'items': [{'productId': product, 'quantity': quantity}] if quantity else []}
    # Both sessions compete for exactly the same barber/time; only one can succeed.
    def compete(c):
        try: return c.call('POST', '/bookings', request())
        except AssertionError as e:
            assert 'got 409' in str(e), e
            return None
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results = list(pool.map(compete, [customer, customer2]))
    assert sum(r is not None for r in results) == 1, results
    winner = customer if results[0] else customer2
    booking = next(r for r in results if r)
    assert booking['total'] == 310
    assert len(winner.call('GET', '/bookings')) == 1
    other.call('PUT', f"/bookings/{booking['id']}/status", {'status': 'Cancelled'}, status=403)
    customer.call('POST', '/bookings', request(offers[1]), status=409) # only 1 unit remains
    # Snapshot remains at original price even after catalog and product prices change.
    owner.call('POST', f'/manage/barbers/{barbers[0]}/offerings', {'haircutId': cuts[0]['id'], 'price': 200, 'minutes': 45, 'active': True})
    owner.call('PUT', f'/manage/products/{product}', {**product_body, 'price': 90, 'stock': 1}, status=204)
    saved = winner.call('GET', '/bookings')[0]
    assert saved['total'] == 310 and saved['servicePrice'] == 150 and saved['items'][0]['unitPrice'] == 80
    assert len(other.call('GET', '/bookings')) == 0
    owner.call('PUT', f"/bookings/{booking['id']}/status", {'status': 'Confirmed'}, status=204)
    owner.call('PUT', f"/bookings/{booking['id']}/status", {'status': 'Completed'}, status=400) # future
    winner.call('PUT', f"/bookings/{booking['id']}/status", {'status': 'Cancelled'}, status=204)
    winner.call('PUT', f"/bookings/{booking['id']}/status", {'status': 'Cancelled'}, status=409)
    public = anon.call('GET', f'/shops/{shop}'); assert public['products'][0]['stock'] == 3
    # Empty-items booking, schedule boundary, exact adjacent appointment and blocked time.
    customer.call('POST', '/bookings', request(at=start[:11] + '06:00:00+00:00', quantity=0), status=400)
    end = (dt.datetime.fromisoformat(start) + dt.timedelta(minutes=45)).isoformat()
    block = owner.call('POST', f'/manage/barbers/{barbers[0]}/blocks', {'start': start, 'end': end})['id']
    customer.call('POST', '/bookings', request(quantity=0), status=409)
    assert all(s['start'] != start for s in anon.call('GET', f'/offerings/{offers[0]}/slots?date={date}'))
    other.call('DELETE', f'/manage/blocks/{block}', status=403)
    owner.call('DELETE', f'/manage/blocks/{block}', status=204)
    b = customer.call('POST', '/bookings', request(quantity=0))
    owner.call('POST', f'/manage/barbers/{barbers[0]}/blocks', {'start': start, 'end': end}, status=409)
    customer.call('POST', '/bookings', request(at=end, quantity=0))
    customer.call('PUT', f"/bookings/{b['id']}/status", {'status': 'Confirmed'}, status=403)
    # Different barbers compete for the last unit of stock.
    owner.call('PUT', f'/manage/products/{product}', {**product_body, 'stock': 1}, status=204)
    date2 = (dt.datetime.fromisoformat(date) + dt.timedelta(days=1)).date().isoformat()
    next_start = anon.call('GET', f'/offerings/{offers[0]}/slots?date={date2}')[0]['start']
    def stock_compete(pair):
        c, offer = pair
        try: return c.call('POST', '/bookings', request(offer, next_start, 1))
        except AssertionError as e:
            assert 'got 409' in str(e), e
            return None
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        result = list(pool.map(stock_compete, [(customer, offers[0]), (customer2, offers[1])]))
    assert sum(r is not None for r in result) == 1, result
    assert anon.call('GET', f'/shops/{shop}')['products'][0]['stock'] == 0
    # Upload a valid PNG, reject unsupported file bytes, then remove metadata.
    import base64
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIuYAAAAASUVORK5CYII=')
    boundary = '----GestorTest'
    def upload(content, status=200):
        raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nExterior\r\n--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode())
        return owner.call('POST', f'/manage/shops/{shop}/photos', status=status, raw=raw, content_type='multipart/form-data; boundary=' + boundary)
    photo = upload(png)
    assert len(anon.call('GET', f'/shops/{shop}')['photos']) == 1
    upload(b'this-is-not-an-image-file', 400)
    owner.call('DELETE', f"/manage/photos/{photo['id']}", status=204)
    customer.call('POST', '/auth/logout', status=204)
    assert customer.call('GET', '/auth/me') is None
    customer.call('POST', '/auth/login', {'email': customer.email, 'password': 'wrong-password'}, status=401)
    customer.call('POST', '/auth/login', {'email': customer.email, 'password': 'TestPassword1234!'})
    assert customer.call('GET', '/auth/me')['role'] == 'Client'
    print('PASS: auth, CSRF, ownership, shared catalog, slots, overlap concurrency, stock concurrency, cancellation, snapshots, blocks and photos', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--url', default='http://localhost:5191')
    run(parser.parse_args().url)
