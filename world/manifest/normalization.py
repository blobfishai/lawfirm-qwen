#!/usr/bin/env python3
"""Deterministic value normalization used at build time and grade time.

The library intentionally has no locale or network dependencies. Task authors
may add explicit variants, but every generated variant is committed with the
compiled assertion so grading never asks a model to infer equivalence.
"""
from __future__ import annotations

import datetime as dt
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any

VERSION = "1"

_SMALL = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_SCALES = ((1_000_000_000_000, "trillion"), (1_000_000_000, "billion"),
           (1_000_000, "million"), (1_000, "thousand"))
_WORD_VALUES = {word: Decimal(i) for i, word in enumerate(_SMALL)}
_WORD_VALUES.update({word: Decimal(i * 10) for i, word in enumerate(_TENS) if word})


def normalized_text(value: Any) -> str:
    """NFKC, case-fold, normalize punctuation, and collapse whitespace."""
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = text.replace("\u00a0", " ").replace("–", "-").replace("—", "-")
    text = re.sub(r"[\u2018\u2019]", "'", text)
    text = re.sub(r"[\u201c\u201d]", '"', text)
    return re.sub(r"\s+", " ", text).strip()


def _under_thousand(number: int) -> str:
    parts: list[str] = []
    if number >= 100:
        parts.extend((_SMALL[number // 100], "hundred"))
        number %= 100
    if number >= 20:
        tail = _TENS[number // 10]
        if number % 10:
            tail += "-" + _SMALL[number % 10]
        parts.append(tail)
    elif number:
        parts.append(_SMALL[number])
    return " ".join(parts) or "zero"


def number_to_words(value: int) -> str:
    if value < 0:
        return "negative " + number_to_words(-value)
    if value < 1000:
        return _under_thousand(value)
    parts: list[str] = []
    remainder = value
    for scale, label in _SCALES:
        if remainder >= scale:
            head, remainder = divmod(remainder, scale)
            parts.extend((number_to_words(head), label))
    if remainder:
        parts.append(_under_thousand(remainder))
    return " ".join(parts)


def words_to_decimal(value: str) -> Decimal | None:
    tokens = re.findall(r"[a-z]+", normalized_text(value).replace("-", " "))
    if not tokens:
        return None
    negative = tokens and tokens[0] == "negative"
    if negative:
        tokens = tokens[1:]
    total = Decimal(0)
    current = Decimal(0)
    seen = False
    for token in tokens:
        if token in ("and", "dollars", "dollar", "percent"):
            continue
        if token in _WORD_VALUES:
            current += _WORD_VALUES[token]
            seen = True
        elif token == "hundred":
            current = (current or Decimal(1)) * 100
            seen = True
        elif token in {label for _, label in _SCALES}:
            scale = next(Decimal(n) for n, label in _SCALES if label == token)
            total += (current or Decimal(1)) * scale
            current = Decimal(0)
            seen = True
        else:
            return None
    result = total + current
    return -result if negative and seen else (result if seen else None)


def decimal_value(value: Any) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    raw = normalized_text(value)
    words = words_to_decimal(raw)
    if words is not None and not re.search(r"\d", raw):
        return words
    match = re.fullmatch(
        r"\s*\(?\s*[$€£]?\s*([+-]?[\d,]+(?:\.\d+)?)\s*"
        r"(k|thousand|m|mm|million|b|bn|billion|t|trillion)?\s*%?\s*\)?\s*",
        raw,
    )
    if not match:
        return None
    try:
        number = Decimal(match.group(1).replace(",", ""))
    except InvalidOperation:
        return None
    units = {
        None: Decimal(1), "k": Decimal(1_000), "thousand": Decimal(1_000),
        "m": Decimal(1_000_000), "mm": Decimal(1_000_000), "million": Decimal(1_000_000),
        "b": Decimal(1_000_000_000), "bn": Decimal(1_000_000_000),
        "billion": Decimal(1_000_000_000), "t": Decimal(1_000_000_000_000),
        "trillion": Decimal(1_000_000_000_000),
    }
    number *= units[match.group(2)]
    if raw.startswith("(") and raw.endswith(")"):
        number *= -1
    return number


def date_value(value: Any) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    raw = normalized_text(value).replace(",", "")
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%m-%d-%Y",
                "%B %d %Y", "%b %d %Y", "%d %B %Y", "%d %b %Y"):
        try:
            return dt.datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    return None


def canonical(value: Any, kind: str = "string") -> tuple[str, str]:
    kind = kind.casefold()
    if kind in {"money", "number", "integer", "percentage"}:
        number = decimal_value(value)
        if number is not None:
            return kind, format(number.normalize(), "f")
    if kind == "date":
        date = date_value(value)
        if date is not None:
            return kind, date.isoformat()
    if kind in {"section", "citation"}:
        text = normalized_text(value)
        text = re.sub(r"^(?:section|sec\.?|§)\s*", "", text)
        return kind, re.sub(r"\s+", "", text)
    return "string", normalized_text(value)


def equivalent(left: Any, right: Any, kind: str = "string") -> bool:
    return canonical(left, kind) == canonical(right, kind)


def _decimal_display(number: Decimal) -> str:
    text = f"{number:f}"
    # Only zeroes after a decimal point are insignificant.  Stripping every
    # trailing zero turns 500,000,000 into "5" and lets a $500M assertion
    # match an unrelated 5M value.
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def fact_variants(fact: dict[str, Any]) -> list[str]:
    """Enumerate every accepted surface form now, never at grade time."""
    kind = str(fact.get("kind", "string")).casefold()
    value = fact.get("value")
    variants = [str(value), *(str(v) for v in fact.get("variants", []))]
    number = decimal_value(value) if kind in {"money", "number", "integer", "percentage"} else None
    if number is not None:
        raw = _decimal_display(number)
        variants.extend((raw, f"{number:,.0f}" if number == number.to_integral() else f"{number:,f}"))
        if kind == "money":
            variants.extend((f"${raw}", f"${number:,.0f}" if number == number.to_integral() else f"${number:,f}"))
        if kind == "percentage":
            variants.append(f"{raw}%")
        for scale, short, word in ((Decimal(1_000_000_000_000), "T", "trillion"),
                                   (Decimal(1_000_000_000), "B", "billion"),
                                   (Decimal(1_000_000), "M", "million"),
                                   (Decimal(1_000), "K", "thousand")):
            if number and number % scale == 0:
                quotient = number / scale
                q = _decimal_display(quotient)
                variants.extend((f"{q}{short}", f"{q} {word}"))
                if kind == "money":
                    variants.extend((f"${q}{short}", f"${q} {word}"))
        if number == number.to_integral() and abs(number) <= Decimal(999_999_999_999_999):
            variants.append(number_to_words(int(number)))
    if kind == "date":
        date = date_value(value)
        if date:
            variants.extend((date.isoformat(), date.strftime("%B %-d, %Y"),
                             date.strftime("%b %-d, %Y"), date.strftime("%-m/%-d/%Y")))
    if kind == "section":
        locator = re.sub(r"^(?:section|sec\.?|§)\s*", "", normalized_text(value), flags=re.I)
        variants.extend((locator, f"Section {locator}", f"§ {locator}"))
    seen: set[str] = set()
    out: list[str] = []
    for variant in variants:
        key = normalized_text(variant)
        if key and key not in seen:
            seen.add(key)
            out.append(variant)
    return out


def text_contains_fact(text: str, fact: dict[str, Any]) -> bool:
    haystack = normalized_text(text)
    for variant in fact_variants(fact):
        needle = normalized_text(variant)
        if not needle:
            continue
        # Bound alphanumeric values so fact 15 does not match distractor 150.
        pattern = r"(?<![\w])" + re.escape(needle) + r"(?![\w])"
        if re.search(pattern, haystack):
            return True
    return False
