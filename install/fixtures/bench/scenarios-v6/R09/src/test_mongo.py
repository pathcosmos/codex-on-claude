import requests
from bs4 import BeautifulSoup
from datetime import datetime
import pymongo
import os
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB", "test")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "posts")

try:
    client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.server_info()  # 인증 및 연결 테스트
    db = client[MONGO_DB]
    col = db[MONGO_COLLECTION]
except Exception as conn_err:
    print("[MongoDB 연결 오류] {}".format(conn_err))
    print("MONGO_URI, 계정, 비밀번호, authSource 값을 다시 확인하세요.")
    exit(1)


def scrape_post(url):
    html = requests.get(url).text
    soup = BeautifulSoup(html, "html.parser")
    post_id = url.split("/")[-1]
    title = (
        soup.select_one("h1.title").text.strip()
        if soup.select_one("h1.title") else ""
    )
    content = (
        soup.select_one("div.article-body").text.strip()
        if soup.select_one("div.article-body") else ""
    )
    author = (
        soup.select_one("span.nickname").text.strip()
        if soup.select_one("span.nickname") else ""
    )
    created_at = (
        soup.select_one("span.date").text.strip()
        if soup.select_one("span.date") else ""
    )
    comments = []
    for c in soup.select("div.comment"):
        comments.append({
            "comment_id": c.get("data-id", None),
            "author": (
                c.select_one(".author").text.strip()
                if c.select_one(".author") else ""
            ),
            "created_at": (
                c.select_one(".date").text.strip()
                if c.select_one(".date") else ""
            ),
            "content": (
                c.select_one(".content").text.strip()
                if c.select_one(".content") else ""
            ),
            "parent_id": c.get("data-parent-id", None)
        })
    doc = {
        "_id": post_id,
        "url": url,
        "title": title,
        "author": author,
        "created_at": created_at,
        "content": content,
        "comments": comments,
        "crawled_at": datetime.now().isoformat()
    }
    return doc


def main():
    url = "https://itssa.co.kr/all/20659192"  # 테스트용 게시물 주소
    # 컬렉션이 없으면 생성 (MongoDB는 insert 시 자동 생성, 하지만 인덱스 등 명시적 생성 가능)
    if MONGO_COLLECTION not in db.list_collection_names():
        db.create_collection(MONGO_COLLECTION)
        print(f"컬렉션 '{MONGO_COLLECTION}'을(를) 새로 생성했습니다.")
    try:
        doc = scrape_post(url)
        col.insert_one(doc)
        print(f"Inserted: {url}")
    except pymongo.errors.DuplicateKeyError:
        print(f"Duplicate: {url}")
    except Exception as e:
        print(f"Error scraping {url}: {e}")
    # 저장된 결과 불러와서 출력
    result = col.find_one({'_id': url.split("/")[-1]})
    if result:
        print("\n[MongoDB 저장 결과]")
        for k, v in result.items():
            print(f"{k}: {v}")
    else:
        print("MongoDB에서 결과를 찾을 수 없습니다.")


if __name__ == "__main__":
    main()
