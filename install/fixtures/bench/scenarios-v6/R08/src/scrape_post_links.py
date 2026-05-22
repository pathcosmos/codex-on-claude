import requests
from bs4 import BeautifulSoup
import time
import random
import os
from pymongo import MongoClient
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

USER_AGENTS = [
    # Chrome (Windows, Mac, Linux, Android, iOS)
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Linux; Android 10; SM-G975F) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
    (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
        "CriOS/120.0.0.0 Mobile/15E148 Safari/604.1"
    ),
    # Safari (Mac, iOS)
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
        "Version/16.3 Safari/605.1.15"
    ),
    (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
        "Version/16.3 Mobile/15E148 Safari/604.1"
    ),
    # Firefox (Windows, Mac, Linux, Android)
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) "
        "Gecko/20100101 Firefox/122.0"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.2; rv:122.0) "
        "Gecko/20100101 Firefox/122.0"
    ),
    (
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) "
        "Gecko/20100101 Firefox/122.0"
    ),
    (
        "Mozilla/5.0 (Android 13; Mobile; rv:122.0) "
        "Gecko/122.0 Firefox/122.0"
    ),
    # Edge (Windows, Mac)
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
    ),
    # Opera
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0"
    ),
    # Samsung Internet
    (
        "Mozilla/5.0 (Linux; Android 13; SM-S918N) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "SamsungBrowser/23.0 Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
]


def get_html_with_retry(url, max_retries=5, sleep_sec=2):
    """403 Forbidden 발생 시 User-Agent를 바꿔가며 재시도"""
    for attempt in range(max_retries):
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        print(
            f"[REQUEST] {url} (User-Agent: "
            f"{headers['User-Agent'][:30]}..., attempt {attempt+1})"
        )
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            print(f"[RESPONSE] {url} status={resp.status_code}")
            if resp.status_code == 403:
                print(
                    f"[403] Forbidden for {url}, "
                    "retrying with another User-Agent..."
                )
                time.sleep(sleep_sec)
                continue
            resp.raise_for_status()
            print(f"[SUCCESS] {url} ({len(resp.text)} bytes)")
            return resp.text
        except requests.RequestException as e:
            print(
                f"[ERROR] {url} - {e} (attempt {attempt+1}/{max_retries})"
            )
            time.sleep(sleep_sec)
    print(f"[FAIL] Failed to fetch {url} after {max_retries} attempts.")
    raise Exception(f"Failed to fetch {url} after {max_retries} attempts.")


def get_post_links(page_num):
    """페이지 번호에 해당하는 게시물 링크들과, 다음 이동할 페이지 번호를 반환"""
    url = f"https://itssa.co.kr/all/page/{page_num}"
    print(f"[LINKS] Fetching post links from page {page_num} ({url})")
    
    html = get_html_with_retry(url)
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    
    # 게시물 링크 추출 ('/all/숫자' 패턴)
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('/all/'):
            parts = href.split('/')
            if len(parts) >= 3 and parts[2].isdigit():
                post_id = parts[2]
                full_url = f"https://itssa.co.kr/all/{post_id}"
                links.add(full_url)
    print(f"[LINKS] page {page_num}: {len(links)} links found.")

    # 페이지네이션에서 다음 페이지 번호 추출
    next_page_num = None
    btn_pages = soup.select('.btn-page')
    for idx, btn in enumerate(btn_pages):
        if 'on' in btn.get('class', []):
            # 다음 btn-page가 있으면 그 숫자를 next_page_num으로
            if idx + 1 < len(btn_pages):
                next_btn = btn_pages[idx + 1]
                try:
                    next_page_num = int(next_btn.text.strip())
                except Exception:
                    next_page_num = None
            break
    
    return list(links), next_page_num


def save_links_to_mongo(links):
    print(f"[MONGO] Connecting to MongoDB and saving {len(links)} links...")
    load_dotenv()
    mongo_uri = os.getenv("MONGO_URI")
    mongo_db = os.getenv("MONGO_DB", "itssa")
    mongo_col = os.getenv("MONGO_COLLECTION", "post_links")
    client = MongoClient(mongo_uri)
    db = client[mongo_db]
    col = db[mongo_col]
    inserted, skipped = 0, 0
    for link in links:
        result = col.update_one(
            {"url": link},
            {"$setOnInsert": {"url": link}},
            upsert=True
        )
        if result.upserted_id:
            print(f"[MONGO] Inserted: {link}")
            inserted += 1
        else:
            print(f"[MONGO] Already exists: {link}")
            skipped += 1
    print(f"[MONGO] 저장 완료: {inserted}개 신규, {skipped}개 중복.")


def fetch_post_with_delay(url):
    delay = random.randint(1, 5)
    print(f"[DELAY] {delay}s before fetching {url}")
    time.sleep(delay)
    print(f"[SCRAPE] Start fetching {url}")
    html = get_html_with_retry(url)
    print(f"[SCRAPE] Done fetching {url} ({len(html)} bytes)")
    return url, html


def fetch_posts_multithreaded(links, max_workers=5):
    print(
        f"[THREAD] 병렬로 {len(links)}개 게시물 상세 HTML 요청 "
        f"(max_workers={max_workers})"
    )
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {
            executor.submit(fetch_post_with_delay, url): url for url in links
        }
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                url, html = future.result()
                print(f"[THREAD] Success: {url}")
                results.append((url, html))
            except Exception as exc:
                print(f"[THREAD][ERROR] {url} generated an exception: {exc}")
    print("[THREAD] 병렬 수집 완료.")
    return results


def log_doc_preview(doc):
    # MongoDB 입력값 상세 로그 (스타일 적용, logging 사용)
    content_preview = doc['content'][:100] + '...' \
        if doc['content'] and len(doc['content']) > 100 else doc['content']
    log_lines = [
        "========== [MONGODB DOC PREVIEW] ==========",
        f"ID:         {doc['_id']}",
        f"URL:        {doc['url']}",
        f"TITLE:      {doc['title']}",
        f"AUTHOR_ID:  {doc['author']['id']}",
        f"AUTHOR_NM:  {doc['author']['name']}",
        f"CATEGORY:   {doc.get('category', '')}",
        f"LIKE:       {doc.get('like_count', 0)}",
        f"DISLIKE:    {doc.get('dislike_count', 0)}",
        f"VIEW:       {doc.get('view_count', '')}",
        f"CREATED_AT: {doc.get('created_at', '')}",
        f"UPDATED_AT: {doc.get('updated_at', '')}",
        f"CONTENT:    {content_preview}",
        f"COMMENTS:   {len(doc['comments'])}개",
        f"CRAWLED_AT: {doc['crawled_at']}",
        "============================================"
    ]
    for line in log_lines:
        logging.info(line)


def parse_post_html(url, html):
    from bs4 import BeautifulSoup
    from datetime import datetime
    soup = BeautifulSoup(html, "html.parser")
    
    # 게시물 고유 번호를 _id로 사용
    try:
        post_id = url.split("/")[-1]  # URL에서 마지막 숫자를 추출
    except Exception: