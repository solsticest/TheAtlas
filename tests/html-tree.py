"""HTML parser for the Node DOM simulation; does not open a browser or URLs."""
import json
import sys
from html.parser import HTMLParser
sys.stdin.reconfigure(encoding='utf-8')

VOID = set('area base br col embed hr img input link meta param source track wbr'.split())

class TreeParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': '#fragment', 'children': []}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = {'tag': tag, 'attrs': dict(attrs), 'children': []}
        self.stack[-1]['children'].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]['tag'] == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, value):
        self.stack[-1]['children'].append({'text': value})

parser = TreeParser()
parser.feed(sys.stdin.read())
json.dump(parser.root, sys.stdout, ensure_ascii=True)
