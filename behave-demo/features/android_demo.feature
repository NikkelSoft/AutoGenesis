Feature: Edge Pagerendering Tests
  As a user of Edge
  I want to test Pagerendering functionality
  Scenario: Fundamental Test msn.com website
    Given I have launched Edge browser on Android device
    When I click the search box in NTP page
    And I input "msn.com" in the search box
    And I press enter to navigate to the page
    And I wait for the page to load completely
    Then I should see the tab with the title "msn.com"