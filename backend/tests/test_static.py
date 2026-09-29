def test_static_files_revalidate_by_etag(client) -> None:
    # D8: статика игры — Cache-Control: no-cache, кэш живёт через ETag/304
    response = client.get("/index.html")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    etag = response.headers.get("etag")
    assert etag

    cached = client.get("/index.html", headers={"if-none-match": etag})
    assert cached.status_code == 304
