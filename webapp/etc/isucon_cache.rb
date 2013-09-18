#!/usr/bin/ruby

while true
	`curl http://192.168.10.10/ticket_test/1`
	`curl http://192.168.10.10/ticket_test/2`
	`curl http://192.168.10.10/ticket_test/3`
	`curl http://192.168.10.10/ticket_test/4`
	`curl http://192.168.10.10/ticket_test/5`
	sleep(0.5)
end
