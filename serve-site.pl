#!/usr/bin/env perl
use strict;
use warnings;
use FindBin;
use IO::Socket::INET;
use Cwd qw(realpath);
use Encode qw(encode);

# Local preview of every rendered page, plus the site's CSS, fonts and assets.
# No dependencies; no build step. Edits are visible on refresh.
# Usage: perl serve-site.pl [port]
my $port = shift // 8080;
die "Usage: $0 [port]\n" if @ARGV || $port !~ /\A\d+\z/ || $port < 1024 || $port > 65535;
my $root = realpath($FindBin::Bin);
my $server = IO::Socket::INET->new(LocalAddr => '127.0.0.1', LocalPort => $port,
    Listen => 16, ReuseAddr => 1) or die "Cannot listen on port $port: $!\n";
$| = 1;
$SIG{PIPE} = 'IGNORE';
print "Serving rendered pages and site assets at http://localhost:$port\n";
my %mime = (html => 'text/html; charset=utf-8', css => 'text/css; charset=utf-8',
    svg => 'image/svg+xml', png => 'image/png', jpg => 'image/jpeg', jpeg => 'image/jpeg',
    webp => 'image/webp', gif => 'image/gif', ico => 'image/x-icon',
    woff => 'font/woff', woff2 => 'font/woff2', wasm => 'application/wasm',
    mp4 => 'video/mp4', webm => 'video/webm');
while (my $client = $server->accept) {
    eval { serve_request($client); };
    alarm 0;
    warn $@ if $@;
    close $client;
}
sub serve_request {
    my ($client) = @_;
        local $SIG{ALRM} = sub { die "Request timeout\n" };
        alarm 5;
        binmode $client;
        my $line = <$client> // '';
        my ($method, $path) = $line =~ /\A(GET|HEAD) (\S+) HTTP\/1\.[01]\r?\n\z/;
        while (my $header = <$client>) { last if $header =~ /^\r?\n$/; }
        alarm 0;
        if (!defined $path) { reply($client, '400 Bad Request', 'text/plain', 'Bad request', 0); return; }
        $path =~ s/\?.*//;
        $path =~ s/%([0-9a-fA-F]{2})/chr(hex($1))/ge;
        my $head = $method eq 'HEAD';
        if ($path =~ /\0|\\/ || grep { $_ eq '..' } split '/', $path) {
            reply($client, '403 Forbidden', 'text/plain', 'Forbidden', $head); return;
        }
        if ($path eq '/') {
            opendir my $dir, "$root/rendered" or die "$!\n";
            my @pages = sort grep { /\.html\z/ } readdir $dir;
            closedir $dir;
            my $body = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local site preview</title><link rel="stylesheet" href="/site.css"><main><h1>Local site preview</h1><ul>';
            for my $page (@pages) {
                my $name = $page;
                $name =~ s/\.html$//; $name =~ s/-/ /g;
                $body .= qq{<li><a href="/$page">$name</a></li>};
            }
            $body .= '</ul></main></html>';
            reply($client, '200 OK', $mime{html}, $body, $head); return;
        }
        my $candidate = $path =~ m{\A/(?:assets/|fonts/|[^/]+\.css\z)}
            ? "$root$path" : "$root/rendered$path";
        $candidate .= '.html' if !-f $candidate && -f "$candidate.html";
        my $file = realpath($candidate);
        if (!defined($file) || index($file, "$root/") != 0 || !-f $file) {
            reply($client, '404 Not Found', 'text/plain', 'Not found', $head); return;
        }
        open my $fh, '<:raw', $file or die "$file: $!\n";
        my ($extension) = $file =~ /\.([^.]+)$/;
        my $type = $mime{$extension // ''} // 'application/octet-stream';
        print {$client} "HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: " . (-s $fh)
            . "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        unless ($head) { while (read $fh, my $chunk, 65536) { print {$client} $chunk; } }
        close $fh;
}
sub reply {
    my ($client, $status, $type, $body, $head) = @_;
    $body = encode('UTF-8', $body);
    print {$client} "HTTP/1.1 $status\r\nContent-Type: $type\r\nContent-Length: " . length($body)
        . "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
    print {$client} $body unless $head;
}
