self.addEventListener('push', function (event) {
    const data = event.data ? event.data.json() : { title: 'Thông báo', body: 'Có cập nhật mới!' };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: './icon.png'
        })
    );
});