import hashlib
import hmac
import json
from datetime import datetime
from urllib.parse import urlencode


def signed_init_data(
    *,
    token: str,
    auth_date: datetime,
    user: dict[str, object] | None,
    extra_fields: dict[str, str] | None = None,
) -> str:
    values = {"auth_date": str(int(auth_date.timestamp()))}
    if user is not None:
        values["user"] = json.dumps(user, separators=(",", ":"), ensure_ascii=False)
    if extra_fields:
        values.update(extra_fields)
    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    values["hash"] = hmac.new(
        secret, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    return urlencode(values)
