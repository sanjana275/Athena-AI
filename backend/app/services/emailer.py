import logging
import smtplib
from email.message import EmailMessage

import httpx

from ..config import settings

log = logging.getLogger("emailer")


def send_email(to: str, subject: str, text: str) -> None:
    """Resend (HTTPS API) > SMTP > log to console (development)."""
    try:
        if settings.resend_api_key:
            r = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={"from": settings.email_from, "to": [to], "subject": subject, "text": text},
                timeout=15,
            )
            r.raise_for_status()
        elif settings.smtp_host:
            msg = EmailMessage()
            msg["From"], msg["To"], msg["Subject"] = settings.email_from, to, subject
            msg.set_content(text)
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                s.starttls()
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        else:
            log.warning("No email provider configured. Email to %s:\n%s\n%s", to, subject, text)
    except Exception:  # never leak provider errors to the requester
        log.exception("Failed to send email to %s", to)
