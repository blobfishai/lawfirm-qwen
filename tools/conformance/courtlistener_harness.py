"""Minimal live CourtListener v4 server for the conformance replay.

This file is mounted into the unmodified pinned CourtListener image.  It seeds
the actual CourtListener Django models, uses the actual v4 routers,
serializers, filters, authentication and pagination, and exposes only the API
server needed by ``cl_livediff.py``.  Search endpoints are intentionally not
seeded into Elasticsearch; their real wire contract is checked against the
official source serializers separately by the diff runner.
"""
from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cl.settings")

import django

django.setup()

from django.contrib.auth.models import Permission, User
from django.core.management import call_command
from django.apps import apps
from django.db import transaction
from django.db.models.signals import post_migrate
from rest_framework.authtoken.models import Token

from cl.alerts.models import DocketAlert
from cl.people_db.models import Attorney, Party, PartyType, Role
from cl.search.models import Citation, Court, Docket, DocketEntry, Opinion, OpinionCluster, RECAPDocument
from cl.search.apps import create_search_indices


COURTS = [
    ("simd", "Simulated District Court, District of Meridian", "FD"),
    ("simca9", "Simulated Court of Appeals, Ninth Circuit", "F"),
    ("simsup", "Simulated Superior Court, Harbor County", "S"),
    ("simbk", "Simulated Bankruptcy Court, District of Meridian", "FB"),
    ("simtax", "Simulated Tax Court", "FS"),
]


def seed() -> None:
    # CourtListener has PostgreSQL ``AddIndexConcurrently`` migrations. Django
    # explicitly forbids running those inside an outer transaction, so finish
    # the real migration graph before opening the small seed transaction.
    # In DEVELOPMENT, the upstream app attaches a post-migrate handler that
    # bootstraps production Elasticsearch indices. The conformance target is
    # the REST/Django surface and search serializers, so disconnect only that
    # optional infrastructure hook while leaving the pinned app untouched.
    post_migrate.disconnect(
        create_search_indices,
        sender=apps.get_app_config("search"),
    )
    call_command("migrate", interactive=False, verbosity=0)
    with transaction.atomic():
        _seed_rows()


def _seed_rows() -> None:
    permissions = Permission.objects.filter(codename__in={
        "has_recap_api_access", "view_docket", "view_docketentry",
        "view_recapdocument", "view_opinion", "view_party",
        "add_docketalert", "view_docketalert",
    })
    user, _ = User.objects.get_or_create(
        username="conformance",
        defaults={"email": "courtlistener-user@simulated-firm.example", "is_active": True},
    )
    user.set_password("conformance")
    user.save()
    user.user_permissions.add(*permissions)
    # The token is a local fixture credential, never a production secret. A
    # pinned value makes the live-diff command reproducible without scraping
    # process logs and is isolated to the disposable conformance database.
    Token.objects.filter(user=user).delete()
    token = Token.objects.create(
        user=user,
        key="c0ffee0000000000000000000000000000000000",
    )
    write_user, _ = User.objects.get_or_create(
        username="conformance-write",
        defaults={"email": "courtlistener-write@simulated-firm.example", "is_active": True},
    )
    write_user.set_password("conformance")
    write_user.save()
    write_user.user_permissions.add(*permissions)
    Token.objects.filter(user=write_user).delete()
    Token.objects.create(
        user=write_user,
        key="decaf00000000000000000000000000000000000",
    )

    courts: list[Court] = []
    for index, (court_id, full_name, jurisdiction) in enumerate(COURTS, 1):
        court, _ = Court.objects.update_or_create(
            id=court_id,
            defaults={
                "position": 9000.0 + index,
                "short_name": full_name,
                "full_name": full_name,
                "jurisdiction": jurisdiction,
                "in_use": True,
                "url": "https://www.courtlistener.com/",
            },
        )
        courts.append(court)

    dockets: list[Docket] = []
    for index in range(1, 23):
        case_name = (
            "Bluewater Components v. Meridian Cloud" if index == 1 else
            "Talvern Logistics v. Halcyon Therapeutics" if index == 7 else
            f"Conformance Plaintiff {index} v. Conformance Defendant {index}"
        )
        docket, _ = Docket.objects.update_or_create(
            id=index,
            defaults={
                "source": Docket.RECAP,
                "court": courts[(index - 1) % len(courts)],
                "case_name": case_name,
                "case_name_full": case_name,
                "case_name_short": case_name.split(" v. ", 1)[0],
                "docket_number": f"1:26-cv-{6000 + index}",
                "docket_number_raw": f"1:26-cv-{6000 + index}",
                "pacer_case_id": str(100000 + index),
                "date_filed": f"2026-{((index - 1) % 7) + 1:02d}-{((index - 1) % 25) + 1:02d}",
                "nature_of_suit": "Antitrust" if index % 3 == 0 else "Contract",
                "assigned_to_str": f"Hon. Conformance Judge {index}",
                "cause": "15:1 Antitrust" if index % 3 == 0 else "28:1332 Diversity",
                "jury_demand": "Defendant",
                "slug": f"conformance-{index}",
            },
        )
        dockets.append(docket)

    entries: list[DocketEntry] = []
    for index in range(1, 31):
        docket = dockets[(index - 1) % len(dockets)]
        entry, _ = DocketEntry.objects.update_or_create(
            id=index,
            defaults={
                "docket": docket,
                "entry_number": index,
                "date_filed": f"2026-07-{((index - 1) % 25) + 1:02d}",
                "description": f"CONFORMANCE FILING {index}",
                "recap_sequence_number": f"202607{index:04d}",
            },
        )
        entries.append(entry)

    for index in range(1, 26):
        RECAPDocument.objects.update_or_create(
            id=index,
            defaults={
                "docket_entry": entries[(index - 1) % len(entries)],
                "document_type": RECAPDocument.PACER_DOCUMENT,
                "document_number": str(index),
                "description": f"Conformance document {index}",
                "page_count": index + 1,
                "is_sealed": False,
                "plain_text": f"Conformance filing body {index}.",
                "pacer_doc_id": f"conformance-{index}",
            },
        )

    for index in range(1, 27):
        cluster, _ = OpinionCluster.objects.update_or_create(
            id=index,
            defaults={
                "docket": dockets[(index - 1) % len(dockets)],
                "case_name": f"Conformance Opinion {index}",
                "case_name_full": f"Conformance Opinion {index}",
                "case_name_short": f"Conformance {index}",
                "date_filed": f"2025-{((index - 1) % 12) + 1:02d}-01",
                "slug": f"conformance-opinion-{index}",
                "source": "C",
                "precedential_status": "Published",
            },
        )
        Opinion.objects.update_or_create(
            id=index,
            defaults={
                "cluster": cluster,
                "type": Opinion.COMBINED,
                "author_str": "",
                "plain_text": f"Conformance opinion body {index}.",
                "page_count": index + 2,
                "sha1": f"{index:040x}",
            },
        )
        if index == 1:
            Citation.objects.update_or_create(
                cluster=cluster,
                volume="410",
                reporter="U.S.",
                page="113",
                defaults={"type": Citation.FEDERAL},
            )

    for index in range(1, 51):
        party, _ = Party.objects.update_or_create(
            id=index,
            defaults={"name": f"Conformance Party {index}", "extra_info": ""},
        )
        PartyType.objects.update_or_create(
            docket=dockets[(index - 1) % len(dockets)],
            party=party,
            name="Plaintiff" if index % 2 else "Defendant",
        )
        attorney, _ = Attorney.objects.update_or_create(
            id=index,
            defaults={"name": f"Conformance Attorney {index}", "contact_raw": ""},
        )
        Role.objects.get_or_create(
            docket=dockets[(index - 1) % len(dockets)],
            party=party,
            attorney=attorney,
            role=Role.ATTORNEY_TO_BE_NOTICED,
            date_action=None,
        )

    # A restarted conformance container must produce the same fixture and
    # leave docket 1 available for the POST replay below.
    DocketAlert.objects.filter(user=user).delete()
    DocketAlert.objects.filter(user=write_user).delete()
    for index in range(6):
        DocketAlert.objects.update_or_create(
            user=user,
            docket=dockets[7 + index],
            defaults={"alert_type": DocketAlert.SUBSCRIPTION if index % 3 else DocketAlert.UNSUBSCRIPTION},
        )
    print(token.key, flush=True)


if __name__ == "__main__":
    seed()
    call_command("runserver", "0.0.0.0:8000", use_reloader=False, verbosity=1)
